import {
  ConfigConflictSchema,
  ConfigErrorSchema,
  type ConfigFullSchema,
  ConfigResponseSchema,
  ConfigUpdateSchema,
} from '@root/schemas/config/config.schema.js'
import {
  hasCallbackFailure,
  registerArrWebhooks,
  testArrWebhookAddress,
} from '@services/arr-webhook-address.service.js'
import { PlexTokenCheckError } from '@services/plex-watchlist/api/token-check.js'
import {
  plexTokensChanged,
  withFeedsResetOnTokenChange,
} from '@services/plex-watchlist/rss/token-feeds.js'
import { TagNamingBlockedError } from '@services/user-tags/types.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import type { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '',
    {
      schema: {
        summary: 'Get configuration',
        operationId: 'getConfig',
        description: 'Retrieve the current application configuration settings',
        response: {
          200: ConfigResponseSchema,
          400: ConfigErrorSchema,
          404: ConfigErrorSchema,
          500: ConfigErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        const config = await fastify.db.getConfig()
        if (!config) {
          return reply.notFound('Config not found in database')
        }

        // Override the apprise settings with values from runtime config
        // These are ephemeral and controlled by the apprise-notifications plugin
        const mergedConfig: z.infer<typeof ConfigFullSchema> = {
          ...config,
          // Read the protected apprise values directly from fastify.config
          // systemAppriseUrl comes from the database as it can be configured by the user
          enableApprise: fastify.config.enableApprise,
          appriseUrl: fastify.config.appriseUrl,
        }

        const response: z.infer<typeof ConfigResponseSchema> = {
          success: true,
          config: mergedConfig,
        }

        reply.status(200)
        return response
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch configuration',
        })
        return reply.internalServerError('Unable to fetch configuration')
      }
    },
  )

  fastify.put(
    '',
    {
      schema: {
        summary: 'Update configuration',
        operationId: 'updateConfig',
        description: 'Update the application configuration settings',
        body: ConfigUpdateSchema,
        response: {
          200: ConfigResponseSchema,
          400: ConfigErrorSchema,
          404: ConfigErrorSchema,
          409: ConfigConflictSchema,
          500: ConfigErrorSchema,
          502: ConfigErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        // Schema is .strict() so unknown fields (like enableApprise/appriseUrl) are rejected by Zod
        const safeConfigUpdate = request.body

        if (safeConfigUpdate.plexMobileEnabled === true) {
          const hasPlexPass = fastify.plexServerService.getHasPlexPass()
          if (!hasPlexPass) {
            return reply.badRequest(
              'Plex Pass is required for Plex mobile notifications. Please ensure your Plex account has an active Plex Pass subscription.',
            )
          }
        }

        // Store current config state before changes for service management
        const currentConfig = await fastify.db.getConfig()

        try {
          await fastify.userTags.assertPrefixChangeAllowed(safeConfigUpdate)
        } catch (error) {
          if (error instanceof TagNamingBlockedError) {
            return reply.conflict(error.message)
          }
          throw error
        }

        try {
          await fastify.plexWatchlist.assertTokensAccepted(
            safeConfigUpdate,
            currentConfig?.plexTokens ?? [],
          )
        } catch (error) {
          if (error instanceof PlexTokenCheckError) {
            return error.result === 'rejected'
              ? reply.conflict(error.message)
              : reply.badGateway(error.message)
          }
          throw error
        }

        // The stored baseUrl can be unset while the env default is live, so compare against the runtime config
        const candidate = {
          baseUrl: safeConfigUpdate.baseUrl ?? fastify.config.baseUrl,
          port: safeConfigUpdate.port ?? fastify.config.port,
        }
        const addressChanged =
          candidate.baseUrl !== fastify.config.baseUrl ||
          candidate.port !== fastify.config.port
        if (addressChanged) {
          const webhooks = await testArrWebhookAddress(fastify, candidate)
          // Only a rejected callback blocks the save because a down arr keeps its hook and re-registers at startup
          if (hasCallbackFailure(webhooks)) {
            return reply.code(409).send({
              statusCode: 409,
              error: 'Conflict',
              message:
                'Radarr or Sonarr could not reach Pulsarr at the new address',
              webhooks,
            })
          }
        }

        try {
          await fastify.updateConfigAndPersist(
            withFeedsResetOnTokenChange(
              safeConfigUpdate,
              currentConfig?.plexTokens ?? [],
            ),
          )
        } catch (configUpdateError) {
          logRouteError(fastify.log, request, configUpdateError, {
            message: 'Failed to update configuration',
          })
          return reply.internalServerError('Failed to update configuration')
        }

        const savedConfig = await fastify.db.getConfig()
        if (!savedConfig) {
          return reply.internalServerError(
            'Configuration unexpectedly missing after update',
          )
        }

        const webhooks = addressChanged
          ? await registerArrWebhooks(fastify)
          : undefined

        // Apply runtime log level now that DB is authoritative
        if (
          'logLevel' in safeConfigUpdate &&
          savedConfig.logLevel &&
          fastify.log.level !== savedConfig.logLevel
        ) {
          fastify.log.info(
            `Updating runtime log level to: ${savedConfig.logLevel}`,
          )
          fastify.log.level = savedConfig.logLevel
        }

        // Handle Plex Mobile config changes
        if ('plexMobileEnabled' in safeConfigUpdate) {
          if (safeConfigUpdate.plexMobileEnabled === true) {
            try {
              await fastify.notifications.plexMobile.initialize()
            } catch (error) {
              fastify.log.error(
                { error },
                'Failed to initialize Plex Mobile after enabling',
              )
            }
          } else {
            fastify.notifications.plexMobile.shutdown()
          }
        }

        // Handle Plex server URL changes - clear connection cache and restart SSE
        if (
          'plexServerUrl' in safeConfigUpdate ||
          'plexTokens' in safeConfigUpdate
        ) {
          try {
            fastify.log.info(
              'Plex server connection settings changed, clearing caches and reconnecting SSE',
            )
            if (
              plexTokensChanged(
                safeConfigUpdate,
                currentConfig?.plexTokens ?? [],
              )
            ) {
              fastify.plexServerService.clearCaches()
            } else {
              fastify.plexServerService.clearConnectionCaches()
            }
            fastify.plexServerService.disconnectSSE()
            await fastify.plexServerService.connectSSE()
          } catch (error) {
            fastify.log.error(
              { error },
              'Failed to refresh Plex server caches and SSE after config update',
            )
          }
        }

        // Handle TMDB region changes - clear provider cache
        if ('tmdbRegion' in safeConfigUpdate) {
          try {
            fastify.log.info('TMDB region changed, clearing provider cache')
            fastify.tmdb.clearProviderCache()
          } catch (error) {
            fastify.log.error(
              { error },
              'Failed to clear TMDB provider cache after config update',
            )
          }
        }

        // Handle Maintainerr changes - the sync schedule follows the toggle,
        // and a reconcile applies the new state to Maintainerr immediately
        if (
          'maintainerrEnabled' in safeConfigUpdate ||
          'maintainerrUrl' in safeConfigUpdate
        ) {
          const maintainerrActive = Boolean(
            savedConfig.maintainerrEnabled && savedConfig.maintainerrUrl,
          )
          // A replaced or cleared URL leaves the previous instance with an
          // enabled webhook that keeps sending events - disable it there
          const previousBase = currentConfig?.maintainerrUrl?.replace(
            /\/+$/,
            '',
          )
          const savedBase = (savedConfig.maintainerrUrl ?? '').replace(
            /\/+$/,
            '',
          )
          if (previousBase && previousBase !== savedBase) {
            void fastify.maintainerr.disableRemoteConfig(previousBase)
          }
          void fastify.scheduler
            .updateJobSchedule('maintainerr-sync', null, maintainerrActive)
            .catch((error) => {
              fastify.log.error(
                { error },
                'Failed to update maintainerr-sync schedule after config update',
              )
            })
          void fastify.maintainerr.reconcile().catch((error) => {
            fastify.log.error(
              { error },
              'Failed to reconcile Maintainerr after config update',
            )
          })
        }

        // Handle Plex Label Sync config changes - compare before/after states
        if ('plexLabelSync' in safeConfigUpdate) {
          const wasEnabled = currentConfig?.plexLabelSync?.enabled === true
          const isEnabled = savedConfig.plexLabelSync?.enabled === true

          // Log status changes (scheduler jobs automatically handle enable/disable)
          if (!wasEnabled && isEnabled) {
            fastify.log.info('Plex label sync enabled via config update')
          } else if (wasEnabled && !isEnabled) {
            fastify.log.info('Plex label sync disabled via config update')
          } else if ('plexLabelSync' in safeConfigUpdate) {
            fastify.log.info('Plex label sync configuration updated')
          }
        }

        // Config writes can change notification channel statuses
        try {
          fastify.notifications.emitStatusEvents()
        } catch (error) {
          fastify.log.error(
            { error },
            'Failed to emit status events after config update',
          )
        }

        const mergedConfig: z.infer<typeof ConfigFullSchema> = {
          ...savedConfig,
          enableApprise: fastify.config.enableApprise,
          appriseUrl: fastify.config.appriseUrl,
        }

        const response: z.infer<typeof ConfigResponseSchema> = {
          success: true,
          config: mergedConfig,
          webhooks,
        }

        reply.status(200)
        return response
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update configuration',
        })
        return reply.internalServerError('Unable to update configuration')
      }
    },
  )
}

export default plugin
