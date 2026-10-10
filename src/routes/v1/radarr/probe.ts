import { ProbeResponseSchema } from '@schemas/radarr/probe.schema.js'
import {
  ErrorSchema,
  TestConnectionBodySchema,
} from '@schemas/radarr/test-connection.schema.js'
import { HttpError } from '@services/radarr.service.js'
import { logRouteError, stripArrApiErrorPrefix } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/probe',
    {
      schema: {
        summary: 'Probe Radarr routing options',
        operationId: 'probeRadarr',
        description:
          'Read quality profiles, root folders and tags from a Radarr instance with unsaved credentials',
        body: TestConnectionBodySchema,
        response: {
          200: ProbeResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Radarr'],
      },
    },
    async (request, reply) => {
      try {
        const { baseUrl, apiKey } = request.body
        const options = await fastify.radarrManager.probe(baseUrl, apiKey)
        return { success: true as const, ...options }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error probing Radarr',
        })

        if (error instanceof HttpError) {
          return reply.badRequest(
            stripArrApiErrorPrefix('radarr', error.message),
          )
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Unable to probe Radarr'

        return reply.internalServerError(
          stripArrApiErrorPrefix('radarr', errorMessage),
        )
      }
    },
  )
}

export default plugin
