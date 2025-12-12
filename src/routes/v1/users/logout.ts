import { LogoutBodySchema, LogoutResponseSchema } from '@schemas/auth/logout.js'
import { ErrorSchema } from '@schemas/common/error.schema.js'
import { isLocalIpAddress } from '@utils/ip.js'
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
        // Check authentication method setting
        const authMethod = fastify.config.authenticationMethod
        const isAuthDisabled = authMethod === 'disabled'
        const isLocalBypass =
          authMethod === 'requiredExceptLocal' && isLocalIpAddress(request.ip)

        // If auth is disabled globally or for local addresses
        if (isAuthDisabled || isLocalBypass) {
          return reply.badRequest(
            'Logout not available: Authentication is disabled for your IP address.',
          )
        }

        // Normal logout flow
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
