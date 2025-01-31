import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  ConfigResponseSchema,
  ConfigErrorSchema,
} from '@schemas/config/config.schema.js'

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
        
        const response: z.infer<typeof ConfigResponseSchema> = {
          success: true,
          config,
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
}

export default plugin