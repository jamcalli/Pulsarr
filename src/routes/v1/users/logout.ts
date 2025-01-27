import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import { LogoutBodySchema, LogoutResponseSchema } from '@schemas/auth/logout.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof LogoutBodySchema>
    Reply: z.infer<typeof LogoutResponseSchema>
  }>(
    '/logout',
    {
      schema: {
        body: LogoutBodySchema,
        response: {
          200: LogoutResponseSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      try {
        if (!request.session.user) {
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
      } catch (error) {
        throw reply.internalServerError('Logout failed.')
      }
    },
  )
}

export default plugin
