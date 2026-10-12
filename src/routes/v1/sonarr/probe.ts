import { HttpError } from '@root/types/arr-connection.types.js'
import { ArrProbeResponseSchema } from '@schemas/common/arr-probe.schema.js'
import { ArrTestConnectionBodySchema } from '@schemas/common/arr-test-connection.schema.js'
import { ErrorSchema } from '@schemas/common/error.schema.js'
import { logRouteError, stripArrApiErrorPrefix } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/probe',
    {
      schema: {
        summary: 'Probe Sonarr routing options',
        operationId: 'probeSonarr',
        description:
          'Read quality profiles, root folders and tags from a Sonarr instance with unsaved credentials',
        body: ArrTestConnectionBodySchema,
        response: {
          200: ArrProbeResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const { baseUrl, apiKey } = request.body
        const options = await fastify.sonarrManager.probe(baseUrl, apiKey)
        return { success: true as const, ...options }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error probing Sonarr',
        })

        if (error instanceof HttpError) {
          return reply.badRequest(
            stripArrApiErrorPrefix('sonarr', error.message),
          )
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Unable to probe Sonarr'

        return reply.internalServerError(
          stripArrApiErrorPrefix('sonarr', errorMessage),
        )
      }
    },
  )
}

export default plugin
