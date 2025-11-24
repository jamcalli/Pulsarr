import {
  ConfigErrorSchema,
  ConfigGetResponseSchema,
  ConfigUpdateResponseSchema,
  ConfigUpdateSchema,
} from '@root/schemas/config/config.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply:
      | z.infer<typeof ConfigGetResponseSchema>
      | z.infer<typeof ConfigErrorSchema>
  }>(
    '/config',
    {
      schema: {
        summary: 'Get configuration',
        operationId: 'getConfig',
        description: 'Retrieve the current application configuration settings',
        response: {
          200: ConfigGetResponseSchema,
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
        const mergedConfig = {
          ...config,
          // Read the protected apprise values directly from fastify.config
          // systemAppriseUrl comes from the database as it can be configured by the user
          enableApprise: fastify.config.enableApprise,
          appriseUrl: fastify.config.appriseUrl,
        }

        const response: z.infer<typeof ConfigGetResponseSchema> = {
          success: true,
          config: mergedConfig,
        }

        reply.status(200)
        return response
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch configuration',
        })
        return reply.internalServerError('Unable to fetch configuration')
      }
    },
  )

  // Updated PUT handler for /config route to avoid race conditions
  fastify.put<{
    Body: z.infer<typeof ConfigUpdateSchema>
    Reply:
      | z.infer<typeof ConfigUpdateResponseSchema>
      | z.infer<typeof ConfigErrorSchema>
  }>(
    '/config',
    {
      schema: {
        summary: 'Update configuration',
        operationId: 'updateConfig',
        description: 'Update the application configuration settings',
        body: ConfigUpdateSchema,
        response: {
          200: ConfigUpdateResponseSchema,
          400: ConfigErrorSchema,
          404: ConfigErrorSchema,
          500: ConfigErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        // Create a copy of the config update without the protected Apprise fields
        const { enableApprise, appriseUrl, ...safeConfigUpdate } = request.body

        // If someone tries to update the protected fields, log a warning
        if (enableApprise !== undefined || appriseUrl !== undefined) {
          return reply.badRequest(
            'enableApprise and appriseUrl are read-only via API',
          )
        }

        // Validate Plex Pass requirement for Tautulli
        if (safeConfigUpdate.tautulliEnabled === true) {
          if (!fastify.config.selfRss || !fastify.config.friendsRss) {
            return reply.badRequest(
              'Plex Pass is required for Tautulli integration. Please generate RSS feeds first to verify Plex Pass subscription.',
            )
          }
        }

        // Store current config state before changes for service management
        const currentConfig = await fastify.db.getConfig()

        // Store current runtime values for revert if needed
        // Using Record type avoids complex type narrowing for dynamic property access
        const originalRuntimeValues: Record<string, unknown> = {}
        for (const key of Object.keys(safeConfigUpdate)) {
          originalRuntimeValues[key] =
            fastify.config[key as keyof typeof fastify.config]
        }

        // First update the runtime config
        try {
          await fastify.updateConfig(safeConfigUpdate)
        } catch (configUpdateError) {
          logRouteError(fastify.log, request, configUpdateError, {
            message: 'Failed to update runtime configuration',
          })
          return reply.internalServerError(
            'Failed to update runtime configuration',
          )
        }

        // Now update the database
        const dbUpdated = await fastify.db.updateConfig(safeConfigUpdate)
        if (!dbUpdated) {
          // Revert runtime config using stored values
          try {
            await fastify.updateConfig(originalRuntimeValues)
          } catch (revertError) {
            logRouteError(fastify.log, request, revertError, {
              message: 'Failed to revert runtime configuration',
            })
          }
          return reply.internalServerError(
            'Failed to update configuration in database',
          )
        }

        const savedConfig = await fastify.db.getConfig()
        if (!savedConfig) {
          return reply.internalServerError(
            'Configuration unexpectedly missing after update',
          )
        }

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

        // Handle Tautulli config changes
        if (
          'tautulliEnabled' in safeConfigUpdate ||
          'tautulliUrl' in safeConfigUpdate ||
          'tautulliApiKey' in safeConfigUpdate
        ) {
          // Initialize if just enabled
          if (safeConfigUpdate.tautulliEnabled === true) {
            try {
              await fastify.tautulli.initialize()
            } catch (error) {
              fastify.log.error(
                { error },
                'Failed to initialize Tautulli after enabling',
              )
            }
          }
        }

        // Handle Plex server URL changes - clear connection cache
        if (
          'plexServerUrl' in safeConfigUpdate ||
          'plexTokens' in safeConfigUpdate
        ) {
          try {
            fastify.log.info(
              'Plex server connection settings changed, clearing caches',
            )
            fastify.plexServerService.clearCaches()
          } catch (error) {
            fastify.log.error(
              { error },
              'Failed to clear Plex server caches after config update',
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

        // Merge saved DB config with runtime Apprise settings
        const mergedConfig = {
          ...savedConfig,
          enableApprise: fastify.config.enableApprise,
          appriseUrl: fastify.config.appriseUrl,
        }

        const response: z.infer<typeof ConfigUpdateResponseSchema> = {
          success: true,
          config: mergedConfig,
        }

        reply.status(200)
        return response
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to update configuration',
        })
        return reply.internalServerError('Unable to update configuration')
      }
    },
  )
}

export default plugin
