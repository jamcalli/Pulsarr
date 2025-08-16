import {
  CreateAdminErrorSchema,
  CreateAdminResponseSchema,
  CreateAdminSchema,
} from '@schemas/auth/admin-user.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof CreateAdminSchema>
    Reply: z.infer<typeof CreateAdminResponseSchema>
  }>(
    '/create-admin',
    {
      schema: {
        summary: 'Create admin user',
        operationId: 'createAdminUser',
        description: 'Create the first admin user account for the system',
        body: CreateAdminSchema,
        response: {
          201: CreateAdminResponseSchema,
          409: CreateAdminErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      const { email, username, password } = request.body

      try {
        const hasAdmin = await fastify.db.hasAdminUsers()
        if (hasAdmin) {
          reply.status(409)
          return {
            success: false,
            message: 'An admin user already exists in the system',
          }
        }

        const existingEmail = await fastify.db.getAdminUser(email)
        const existingUsername =
          await fastify.db.getAdminUserByUsername(username)

        if (existingEmail) {
          reply.status(409)
          return { success: false, message: 'Email already exists' }
        }

        if (existingUsername) {
          reply.status(409)
          return { success: false, message: 'Username already exists' }
        }

        const hashedPassword = await fastify.hash(password)
        const created = await fastify.db.createAdminUser({
          email,
          username,
          password: hashedPassword,
          role: 'admin',
        })

        if (!created) {
          throw new Error('Failed to create admin user')
        }

        reply.status(201)
        return { success: true, message: 'Admin user created successfully' }
      } catch (_error) {
        return reply.internalServerError('Failed to create admin user')
      }
    },
  )
}

export default plugin
