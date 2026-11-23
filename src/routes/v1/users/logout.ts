import { LogoutBodySchema, LogoutResponseSchema } from '@schemas/auth/logout.js'
import { ErrorSchema } from '@schemas/common/error.schema.js'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/logout',
    {
      schema: {
        summary: 'User logout',
        operationId: 'logoutUser',
        description: 'End the current user session and destroy authentication',
        body: LogoutBodySchema,
        response: {
          200: LogoutResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      try {
        if (getAuthBypassStatus(fastify, request).shouldBypass) {
          return reply.badRequest(
            'Logout not available: Authentication is disabled for your IP address.',
          )
        }

        if (!request.session.user) {
          return reply.badRequest('No active session found.')
        }

        await request.session.destroy()
        return {
          success: true,
          message: 'Successfully logged out.',
        }
      } catch (_error) {
        return reply.internalServerError('Logout failed.')
      }
    },
  )
}

export default plugin
