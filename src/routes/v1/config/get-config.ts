import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  ConfigSchema,
  ConfigResponseSchema,
  ConfigErrorSchema,
} from '@schemas/config/get-config.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: z.infer<typeof ConfigResponseSchema>
  }>(
    '/config',
    {
      schema: {
        response: {
          200: ConfigResponseSchema,
          500: ConfigErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        const config = await fastify.db.getConfig(1)

        if (!config) {
          throw new Error('Config not found in database')
        }

        const response: z.infer<typeof ConfigResponseSchema> = {
          success: true,
          config,
        }

        reply.status(200)
        return response
      } catch (error) {
        fastify.log.error('Error fetching config:', error)
        throw reply.internalServerError('Unable to fetch configuration')
      }
    },
  )
}

export default plugin
