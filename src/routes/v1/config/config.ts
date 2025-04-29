import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  ConfigSchema,
  ConfigResponseSchema,
  ConfigErrorSchema,
} from '@root/schemas/config/config.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: z.infer<typeof ConfigResponseSchema>
  }>(
    '/config',
    {
      schema: {
        response: {
          200: ConfigResponseSchema,
          404: ConfigErrorSchema,
          500: ConfigErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        const config = await fastify.db.getConfig(1)
        if (!config) {
          throw reply.notFound('Config not found in database')
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
          throw err
        }

        fastify.log.error('Error fetching config:', err)
        throw reply.internalServerError('Unable to fetch configuration')
      }
    },
  )

  // Updated PUT handler for /config route to avoid race conditions
  fastify.put<{
    Body: z.infer<typeof ConfigSchema>
    Reply: z.infer<typeof ConfigResponseSchema>
  }>(
    '/config',
    {
      schema: {
        body: ConfigSchema,
        response: {
          200: ConfigResponseSchema,
          400: ConfigErrorSchema,
          500: ConfigErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        // Create a copy of the config update without the protected Apprise fields
        // but allow systemAppriseUrl to be updated
        const { enableApprise, appriseUrl, ...safeConfigUpdate } = request.body

        // If someone tries to update the protected fields, log a warning
        if (enableApprise !== undefined || appriseUrl !== undefined) {
          fastify.log.warn(
            'Attempt to update protected Apprise config via API was prevented',
            {
              enableApprise,
              appriseUrl: appriseUrl ? '[redacted]' : undefined,
            },
          )
        }

        // First update the runtime config - if this fails, we won't update the DB
        try {
          await fastify.updateConfig(safeConfigUpdate)
        } catch (configUpdateError) {
          fastify.log.error('Error updating runtime config:', configUpdateError)
          throw reply.badRequest('Failed to update runtime configuration')
        }

        // Now update the database since runtime config was successful
        const dbUpdated = await fastify.db.updateConfig(1, safeConfigUpdate)
        if (!dbUpdated) {
          // Attempt to revert runtime config since DB update failed
          try {
            // Get the original config to revert to
            const originalConfig = await fastify.db.getConfig(1)
            if (originalConfig) {
              await fastify.updateConfig(originalConfig)
            }
          } catch (revertError) {
            fastify.log.error('Failed to revert runtime config:', revertError)
          }
          throw reply.badRequest('Failed to update configuration in database')
        }

        const savedConfig = await fastify.db.getConfig(1)
        if (!savedConfig) {
          throw reply.notFound('No configuration found after update')
        }

        // For the response, merge the saved DB config with the runtime Apprise settings
        // We use fastify.config for the protected apprise settings since it has the current values
        // systemAppriseUrl comes from the database as it's allowed to be updated
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
          throw err
        }
        fastify.log.error('Error updating config:', err)
        throw reply.internalServerError('Unable to update configuration')
      }
    },
  )
}

export default plugin
