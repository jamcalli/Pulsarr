import {
  PlexPassStatusErrorSchema,
  PlexPassStatusResponseSchema,
} from '@schemas/plex/plex-pass-status.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/plex-pass-status',
    {
      schema: {
        summary: 'Get Plex Pass status',
        operationId: 'getPlexPassStatus',
        description:
          'Returns whether the admin Plex account has an active Plex Pass subscription',
        response: {
          200: PlexPassStatusResponseSchema,
          500: PlexPassStatusErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const hasPlexPass = fastify.plexServerService.getHasPlexPass() ?? false
        return { hasPlexPass }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get Plex Pass status',
        })
        return reply.internalServerError('Failed to get Plex Pass status')
      }
    },
  )
}

export default plugin
