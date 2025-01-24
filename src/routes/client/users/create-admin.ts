import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  CreateAdminSchema,
  CreateAdminResponseSchema,
  CreateAdminErrorSchema,
} from '@schemas/auth/admin-user.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof CreateAdminSchema>
    Reply: z.infer<typeof CreateAdminResponseSchema>
  }>(
    '/create-admin',
    {
      schema: {
        body: CreateAdminSchema,
        response: {
          201: CreateAdminResponseSchema,
          409: CreateAdminErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      const { username, password } = request.body

      try {
        const existingUser = await fastify.db.getAdminUser(username)

        if (existingUser) {
          reply.status(409)
          return { success: false, message: 'Username already exists' }
        }

        const hashedPassword = await fastify.hash(password)
        const created = await fastify.db.createAdminUser({
          username,
          password: hashedPassword,
          role: 'admin',
        })

        if (!created) {
          throw new Error('Failed to create admin user')
        }

        reply.status(201)
        return { success: true, message: 'Admin user created successfully' }
      } catch (error) {
        throw reply.internalServerError('Failed to create admin user')
      }
    },
  )
}

export default plugin
