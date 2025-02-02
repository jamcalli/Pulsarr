import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  ConfigSchema,
  ConfigResponseSchema,
  ConfigErrorSchema,
} from '@root/schemas/config/config.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
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
        const configUpdate = request.body

        const dbUpdated = await fastify.db.updateConfig(1, configUpdate)
        if (!dbUpdated) {
          throw reply.badRequest('Failed to update configuration')
        }

        const savedConfig = await fastify.db.getConfig(1)
        if (!savedConfig) {
          throw reply.notFound('No configuration found after update')
        }

        const updatedConfig = await fastify.updateConfig(savedConfig)

        const response: z.infer<typeof ConfigResponseSchema> = {
          success: true,
          config: updatedConfig,
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
