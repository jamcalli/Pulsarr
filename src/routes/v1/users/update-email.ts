import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { UpdateEmailSchema } from '@schemas/auth/users.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

const responseSchema = z.object({
  message: z.string(),
})

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.put(
    '/update-email',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 minute',
        },
      },
      schema: {
        summary: 'Update user email',
        operationId: 'updateUserEmail',
        description:
          'Change the current user email by providing current password and new email',
        body: UpdateEmailSchema,
        response: {
          200: responseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          409: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      const { newEmail, currentPassword } = request.body
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

        if (newEmail.toLowerCase() === user.email.toLowerCase()) {
          return reply.badRequest(
            'New email cannot be the same as the current email.',
          )
        }

        const existingEmail = await fastify.db.getAdminUser(newEmail)
        if (existingEmail && existingEmail.id !== userId) {
          return reply.conflict('Email already exists')
        }

        const updated = await fastify.db.updateAdminEmail(userId, newEmail)

        if (!updated) {
          throw new Error('Failed to update email')
        }

        request.session.user.email = newEmail

        return { message: 'Email updated successfully' }
      } catch (_error) {
        return reply.internalServerError('Failed to update email')
      }
    },
  )
}

export default plugin
