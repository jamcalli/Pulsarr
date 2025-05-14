import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  TestConnectionQuerySchema,
  TestConnectionResponseSchema,
  ErrorSchema,
} from '@schemas/radarr/test-connection.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: z.infer<typeof TestConnectionQuerySchema>
    Reply: z.infer<typeof TestConnectionResponseSchema>
  }>(
    '/test-connection',
    {
      schema: {
        querystring: TestConnectionQuerySchema,
        response: {
          200: TestConnectionResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Radarr'],
      },
    },
    async (request, reply) => {
      try {
        const { baseUrl, apiKey } = request.query
        const result = await fastify.radarrManager.testConnection(
          baseUrl,
          apiKey,
        )

        return {
          success: result.success,
          message: result.message,
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error testing Radarr connection:', err)
        return reply.internalServerError('Unable to test Radarr connection')
      }
    },
  )
}

export default plugin
