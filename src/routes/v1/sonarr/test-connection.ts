import {
  ErrorSchema,
  TestConnectionBodySchema,
  TestConnectionResponseSchema,
} from '@schemas/sonarr/test-connection.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
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
        logRouteError(fastify.log, request, err, {
          message: 'Error testing Sonarr connection',
        })

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
