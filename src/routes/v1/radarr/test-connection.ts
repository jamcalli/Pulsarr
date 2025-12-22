import {
  ErrorSchema,
  TestConnectionBodySchema,
  TestConnectionResponseSchema,
} from '@schemas/radarr/test-connection.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
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
        logRouteError(fastify.log, request, err, {
          message: 'Error testing Radarr connection',
        })

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
