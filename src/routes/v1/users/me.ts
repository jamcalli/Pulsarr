import type { FastifyPluginAsync } from 'fastify'
import {
  MeResponseSchema,
  MeErrorSchema,
  type MeResponse,
  type MeError,
} from '@schemas/users/me.schema.js'
import { fetchPlexAvatar } from '@utils/plex.js'

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
          const config = await fastify.db.getConfig()

          if (config?.plexTokens && config.plexTokens.length > 0) {
            // Use the first available Plex token
            const plexToken = config.plexTokens[0]
            plexConnected = true
            avatar = await fetchPlexAvatar(plexToken, fastify.log)
          }
        } catch (error) {
          // Don't fail the entire request if Plex avatar fetch fails
          fastify.log.warn('Failed to fetch Plex token or avatar:', error)
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
        fastify.log.error('Error in /me endpoint:', error)
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
