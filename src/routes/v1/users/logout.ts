import { LogoutBodySchema, LogoutResponseSchema } from '@schemas/auth/logout.js'
import { isLocalIpAddress } from '@utils/ip.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof LogoutBodySchema>
    Reply: z.infer<typeof LogoutResponseSchema>
  }>(
    '/logout',
    {
      schema: {
        summary: 'User logout',
        operationId: 'logoutUser',
        description: 'End the current user session and destroy authentication',
        body: LogoutBodySchema,
        response: {
          200: LogoutResponseSchema,
          400: LogoutResponseSchema,
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
          // Return 400 Bad Request to prevent the client from treating this as a successful logout
          reply.status(400)
          return {
            success: false,
            message:
              'Logout not available: Authentication is disabled for your IP address.',
          }
        }

        // Normal logout flow
        if (!request.session.user) {
          reply.status(400)
          return {
            success: false,
            message: 'No active session found.',
          }
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
