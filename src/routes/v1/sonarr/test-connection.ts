import {
  ErrorSchema,
  TestConnectionBodySchema,
  TestConnectionResponseSchema,
} from '@schemas/sonarr/test-connection.schema.js'
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
        summary: 'Test Sonarr connection',
        operationId: 'testSonarrConnection',
        description:
          'Test connectivity to a Sonarr instance with provided credentials',
        body: TestConnectionBodySchema,
        response: {
          200: TestConnectionResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const { baseUrl, apiKey } = request.body
        const result = await fastify.sonarrManager.testConnection(
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
          'sonarr',
          'Error testing connection',
        )

        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Unable to test Sonarr connection'

        return reply.internalServerError(
          errorMessage.replace(/Sonarr API error: /, ''),
        )
      }
    },
  )
}

export default plugin
