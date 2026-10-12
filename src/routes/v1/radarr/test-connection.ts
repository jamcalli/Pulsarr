import {
  ArrTestConnectionBodySchema,
  ArrTestConnectionResponseSchema,
} from '@schemas/common/arr-test-connection.schema.js'
import { ErrorSchema } from '@schemas/common/error.schema.js'
import { logRouteError, stripArrApiErrorPrefix } from '@utils/route-errors.js'
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
        body: ArrTestConnectionBodySchema,
        response: {
          200: ArrTestConnectionResponseSchema,
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
          ...result,
          message: stripArrApiErrorPrefix('radarr', result.message),
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error testing Radarr connection',
        })

        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unable to test Radarr connection'

        return reply.internalServerError(
          stripArrApiErrorPrefix('radarr', errorMessage),
        )
      }
    },
  )
}

export default plugin
