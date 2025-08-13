import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { UpdateCredentialsSchema } from '@schemas/auth/users.js'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'

const responseSchema = z.object({
  message: z.string(),
})

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.put<{
    Body: z.infer<typeof UpdateCredentialsSchema>
    Reply: z.infer<typeof responseSchema>
  }>(
    '/update-password',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 minute',
        },
      },
      schema: {
        summary: 'Update user password',
        operationId: 'updateUserPassword',
        description:
          'Change the current user password by providing current and new password',
        body: UpdateCredentialsSchema,
        response: {
          200: responseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      const { newPassword, currentPassword } = request.body
      const email = request.session.user.email

      try {
        const user = await fastify.db.getAdminUser(email)

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
          email,
          hashedPassword,
        )

        if (!updated) {
          throw new Error('Failed to update password')
        }

        return { message: 'Password updated successfully' }
      } catch (_error) {
        return reply.internalServerError('Failed to update password')
      }
    },
  )
}

export default plugin
