import {
  ErrorSchema,
  TestConnectionBodySchema,
  TestConnectionResponseSchema,
} from '@schemas/radarr/test-connection.schema.js'
import { logServiceError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof TestConnectionBodySchema>
    Reply: z.infer<typeof TestConnectionResponseSchema>
  }>(
    '/test-connection',
    {
      schema: {
        summary: 'Test Radarr connection',
        operationId: 'testRadarrConnection',
        description:
          'Test connectivity to a Radarr instance with provided credentials',
        body: TestConnectionBodySchema,
        response: {
          200: TestConnectionResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Radarr'],
      },
    },
    async (request, reply) => {
      try {
        const { baseUrl, apiKey } = request.body
        const result = await fastify.radarrManager.testConnection(
          baseUrl,
          apiKey,
        )

        return {
          success: result.success,
          message: result.message,
        }
      } catch (err) {
        logServiceError(
          fastify.log,
          request,
          err,
          'radarr',
          'Error testing connection',
        )

        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Unable to test Radarr connection'

        return reply.internalServerError(
          errorMessage.replace(/Radarr API error: /, ''),
        )
      }
    },
  )
}

export default plugin
