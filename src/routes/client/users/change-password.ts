import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { UpdateCredentialsSchema } from '@schemas/auth/users.js'

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
        body: UpdateCredentialsSchema,
        response: {
          200: responseSchema,
          401: responseSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      const { newPassword, currentPassword } = request.body
      const username = request.session.user.username

      try {
        const user = await fastify.db.getAdminUser(username)

        if (!user) {
          return reply.code(401).send({ message: 'User does not exist.' })
        }

        const isPasswordValid = await fastify.compare(
          currentPassword,
          user.password,
        )

        if (!isPasswordValid) {
          return reply.code(401).send({ message: 'Invalid current password.' })
        }

        if (newPassword === currentPassword) {
          reply.status(400)
          return {
            message: 'New password cannot be the same as the current password.',
          }
        }

        const hashedPassword = await fastify.hash(newPassword)
        const updated = await fastify.db.updateAdminPassword(
          username,
          hashedPassword,
        )

        if (!updated) {
          throw new Error('Failed to update password')
        }

        return { message: 'Password updated successfully' }
      } catch (error) {
        reply.internalServerError()
      }
    },
  )
}

export default plugin
