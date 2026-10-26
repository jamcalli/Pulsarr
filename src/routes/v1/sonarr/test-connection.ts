import {
  ArrTestConnectionBodySchema,
  ArrTestConnectionResponseSchema,
} from '@schemas/common/arr-test-connection.schema.js'
import { ErrorSchema } from '@schemas/common/error.schema.js'
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
        body: ArrTestConnectionBodySchema,
        response: {
          200: ArrTestConnectionResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const { baseUrl, apiKey } = request.body
        return await fastify.sonarrManager.testConnection(baseUrl, apiKey)
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error testing Sonarr connection',
        })

        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unable to test Sonarr connection'

        return reply.internalServerError(errorMessage)
      }
    },
  )
}

export default plugin
