import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import { logRouteError } from '@utils/route-errors.js'
import {
  ConfigSchema,
  ConfigResponseSchema,
  ConfigErrorSchema,
} from '@root/schemas/config/config.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply:
      | z.infer<typeof ConfigResponseSchema>
      | z.infer<typeof ConfigErrorSchema>
  }>(
    '/config',
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
        const mergedConfig = {
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
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          // Use proper error format to match the schema
          reply.status(err.statusCode as number)
          return { error: err.message || 'Error fetching configuration' }
        }

        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch configuration',
        })
        reply.status(500)
        return { error: 'Unable to fetch configuration' }
      }
    },
  )

  // Updated PUT handler for /config route to avoid race conditions
  fastify.put<{
    Body: z.infer<typeof ConfigSchema>
    Reply:
      | z.infer<typeof ConfigResponseSchema>
      | z.infer<typeof ConfigErrorSchema>
  }>(
    '/config',
    {
      schema: {
        summary: 'Update configuration',
        operationId: 'updateConfig',
        description: 'Update the application configuration settings',
        body: ConfigSchema,
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
        // Create a copy of the config update without the protected Apprise fields
        const { enableApprise, appriseUrl, ...safeConfigUpdate } = request.body

        // If someone tries to update the protected fields, log a warning
        if (enableApprise !== undefined || appriseUrl !== undefined) {
          reply.status(400)
          return {
            error: 'enableApprise and appriseUrl are read-only via API',
          }
        }

        // Validate Plex Pass requirement for Tautulli
        if (safeConfigUpdate.tautulliEnabled === true) {
          const currentConfig = await fastify.db.getConfig()
          if (!currentConfig?.selfRss || !currentConfig?.friendsRss) {
            reply.status(400)
            return {
              error:
                'Plex Pass is required for Tautulli integration. Please generate RSS feeds first to verify Plex Pass subscription.',
            }
          }
        }

        // Store current config state before changes for service management
        const currentConfig = await fastify.db.getConfig()

        // Store current runtime values for revert if needed
        const originalRuntimeValues = { ...safeConfigUpdate }
        for (const key of Object.keys(originalRuntimeValues)) {
          // biome-ignore lint/suspicious/noExplicitAny: This is a necessary type assertion for dynamic property access
          ;(originalRuntimeValues as any)[key] = (fastify.config as any)[key]
        }

        // First update the runtime config
        try {
          await fastify.updateConfig(safeConfigUpdate)
        } catch (configUpdateError) {
          logRouteError(fastify.log, request, configUpdateError, {
            message: 'Failed to update runtime configuration',
          })
          reply.status(400)
          return { error: 'Failed to update runtime configuration' }
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
          reply.status(400)
          return { error: 'Failed to update configuration in database' }
        }

        const savedConfig = await fastify.db.getConfig()
        if (!savedConfig) {
          reply.status(404)
          return { error: 'No configuration found after update' }
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
                'Failed to initialize Tautulli after enabling:',
                error,
              )
            }
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

        const response: z.infer<typeof ConfigResponseSchema> = {
          success: true,
          config: mergedConfig,
        }

        reply.status(200)
        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          // Use proper error format to match the schema
          reply.status(err.statusCode as number)
          return { error: err.message || 'Error updating configuration' }
        }
        logRouteError(fastify.log, request, err, {
          message: 'Failed to update configuration',
        })
        reply.status(500)
        return { error: 'Unable to update configuration' }
      }
    },
  )
}

export default plugin
