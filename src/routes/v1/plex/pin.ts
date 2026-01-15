import {
  PlexPinErrorSchema,
  PlexPinPollParamsSchema,
  PlexPinPollQuerySchema,
  PlexPinPollResponseSchema,
  PlexPinResponseSchema,
} from '@schemas/plex/pin.schema.js'
import {
  generatePlexPin,
  pollPlexPin,
} from '@services/plex-watchlist/api/pin-auth.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Generate a new PIN for Plex authentication
  fastify.post(
    '/pin',
    {
      schema: {
        summary: 'Generate Plex PIN for authentication',
        operationId: 'generatePlexPin',
        description:
          'Generates a PIN that users can enter at plex.tv/link to authorize Pulsarr access to their Plex account',
        response: {
          200: PlexPinResponseSchema,
          500: PlexPinErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const pin = await generatePlexPin(fastify.log)
        return pin
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to generate Plex PIN',
        })
        return reply.internalServerError('Failed to generate Plex PIN')
      }
    },
  )

  // Poll a PIN to check if user has authorized
  fastify.get(
    '/pin/:pinId',
    {
      schema: {
        summary: 'Poll Plex PIN for auth token',
        operationId: 'pollPlexPin',
        description:
          'Checks if the user has completed authorization at plex.tv/link. Returns authToken when authorized.',
        params: PlexPinPollParamsSchema,
        querystring: PlexPinPollQuerySchema,
        response: {
          200: PlexPinPollResponseSchema,
          500: PlexPinErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const { pinId } = request.params
        const { clientId } = request.query
        const result = await pollPlexPin(pinId, clientId, fastify.log)
        return result
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to poll Plex PIN',
        })
        return reply.internalServerError('Failed to poll Plex PIN')
      }
    },
  )
}

export default plugin
