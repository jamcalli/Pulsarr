import { PlexTvError } from '@root/types/plex-server.types.js'
import {
  PlexServerErrorSchema,
  PlexServerResponseSchema,
  PlexTokenSchema,
} from '@schemas/plex/discover-servers.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/discover-servers',
    {
      schema: {
        summary: 'Discover Plex servers',
        operationId: 'discoverPlexServers',
        description:
          'List and probe every connection to the Plex servers a token owns',
        body: PlexTokenSchema,
        response: {
          200: PlexServerResponseSchema,
          400: PlexServerErrorSchema,
          401: PlexServerErrorSchema,
          403: PlexServerErrorSchema,
          404: PlexServerErrorSchema,
          500: PlexServerErrorSchema,
          504: PlexServerErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const servers = await fastify.plexServerService.discoverServers(
          request.body.plexToken,
        )
        return {
          success: true,
          servers,
          message: `Found ${servers.length} Plex servers`,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to discover Plex servers',
        })

        if (error instanceof Error && error.name === 'TimeoutError') {
          return reply.gatewayTimeout('Plex.tv did not answer in time')
        }

        if (error instanceof PlexTvError) {
          if (error.status === 401) return reply.unauthorized(error.message)
          if (error.status === 403) return reply.forbidden(error.message)
          if (error.status === 404) return reply.notFound(error.message)
          if (error.status >= 500) {
            return reply.internalServerError(error.message)
          }
          return reply.badRequest(error.message)
        }

        return reply.internalServerError('Failed to discover Plex servers')
      }
    },
  )
}

export default plugin
