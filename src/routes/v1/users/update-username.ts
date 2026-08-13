import { CREDENTIAL_RATE_LIMIT } from '@root/plugins/external/rate-limit.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { MessageResponseSchema } from '@root/schemas/common/message.schema.js'
import { UpdateUsernameSchema } from '@schemas/auth/users.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.put(
    '/update-username',
    {
      config: {
        rateLimit: CREDENTIAL_RATE_LIMIT,
      },
      schema: {
        summary: 'Update user username',
        operationId: 'updateUserUsername',
        description:
          'Change the current user username by providing current password and new username',
        body: UpdateUsernameSchema,
        response: {
          200: MessageResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          409: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      const { newUsername, currentPassword } = request.body
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

        if (newUsername.toLowerCase() === user.username.toLowerCase()) {
          return reply.badRequest(
            'New username cannot be the same as the current username.',
          )
        }

        const existingUsername =
          await fastify.db.getAdminUserByUsername(newUsername)
        if (existingUsername && existingUsername.id !== userId) {
          return reply.conflict('Username already exists')
        }

        const updated = await fastify.db.updateAdminUsername(
          userId,
          newUsername,
        )

        if (!updated) {
          throw new Error('Failed to update username')
        }

        request.session.user.username = newUsername

        return { message: 'Username updated successfully' }
      } catch (_error) {
        return reply.internalServerError('Failed to update username')
      }
    },
  )
}

export default plugin
