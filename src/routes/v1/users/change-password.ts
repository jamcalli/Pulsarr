import { CREDENTIAL_RATE_LIMIT } from '@root/plugins/external/rate-limit.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { MessageResponseSchema } from '@root/schemas/common/message.schema.js'
import { UpdateCredentialsSchema } from '@schemas/auth/users.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.put(
    '/update-password',
    {
      config: {
        rateLimit: CREDENTIAL_RATE_LIMIT,
      },
      schema: {
        summary: 'Update user password',
        operationId: 'updateUserPassword',
        description:
          'Change the current user password by providing current and new password',
        body: UpdateCredentialsSchema,
        response: {
          200: MessageResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      const { newPassword, currentPassword } = request.body
      const userId = request.session.user.id

      try {
        const user = await fastify.db.getAdminUserById(userId)

        if (!user) {
          return reply.unauthorized('User does not exist.')
        }

        const isPasswordValid = await fastify.compare(
          currentPassword,
          user.password,
        )

        if (!isPasswordValid) {
          return reply.unauthorized('Invalid current password.')
        }

        if (newPassword === currentPassword) {
          return reply.badRequest(
            'New password cannot be the same as the current password.',
          )
        }

        const hashedPassword = await fastify.hash(newPassword)
        const updated = await fastify.db.updateAdminPassword(
          userId,
          hashedPassword,
        )

        if (!updated) {
          throw new Error('Failed to update password')
        }

        return { message: 'Password updated successfully' }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update password',
        })
        return reply.internalServerError('Failed to update password')
      }
    },
  )
}

export default plugin
