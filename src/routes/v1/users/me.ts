import { MeErrorSchema, MeResponseSchema } from '@schemas/users/me.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
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
        const user = request.user
        if (!user) {
          return reply.unauthorized('User not authenticated')
        }
        const config = fastify.config
        const plexConnected =
          !!config?.plexTokens && config.plexTokens.length > 0

        const primaryUser = await fastify.db.getPrimaryUser()

        return {
          success: true,
          message: 'User information retrieved successfully',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar: primaryUser?.avatar ?? null,
            plexConnected,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve current user information',
        })
        return reply.internalServerError('Failed to retrieve user information')
      }
    },
  )
}

export default plugin
