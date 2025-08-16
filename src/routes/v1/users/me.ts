import {
  type MeError,
  MeErrorSchema,
  type MeResponse,
  MeResponseSchema,
} from '@schemas/users/me.schema.js'
import { fetchPlexAvatar } from '@utils/plex.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: MeResponse | MeError
  }>(
    '/me',
    {
      schema: {
        summary: 'Get current user information',
        operationId: 'getCurrentUser',
        description:
          'Retrieve information about the currently authenticated user, including Plex avatar if available',
        response: {
          200: MeResponseSchema,
          401: MeErrorSchema,
          500: MeErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        // Check if user is authenticated
        if (!request.session?.user) {
          reply.status(401)
          return {
            success: false,
            message: 'Authentication required',
          }
        }

        const sessionUser = request.session.user
        let avatar: string | null = null
        let plexConnected = false

        // Try to get Plex token from config to fetch avatar
        try {
          const config = fastify.config

          if (config?.plexTokens && config.plexTokens.length > 0) {
            // Use the first available Plex token
            const plexToken = config.plexTokens[0]
            avatar = await fetchPlexAvatar(plexToken, fastify.log)
            plexConnected = true
          }
        } catch (error) {
          // Don't fail the entire request if Plex avatar fetch fails
          plexConnected = false
          fastify.log.warn(
            {
              err: error,
              route: `${request.method} ${request.routeOptions?.url || request.url}`,
            },
            'Failed to fetch Plex token or avatar',
          )
        }

        return {
          success: true,
          message: 'User information retrieved successfully',
          user: {
            id: sessionUser.id,
            username: sessionUser.username,
            email: sessionUser.email,
            role: sessionUser.role,
            avatar,
            plexConnected,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve current user information',
        })
        reply.status(500)
        return {
          success: false,
          message: 'Failed to retrieve user information',
        }
      }
    },
  )
}

export default plugin
