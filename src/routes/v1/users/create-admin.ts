import {
  CreateAdminErrorSchema,
  CreateAdminResponseSchema,
  CreateAdminSchema,
} from '@schemas/auth/admin-user.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/create-admin',
    {
      schema: {
        security: [],
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
          return reply.conflict('An admin user already exists in the system')
        }

        const existingEmail = await fastify.db.getAdminUser(email)
        const existingUsername =
          await fastify.db.getAdminUserByUsername(username)

        if (existingEmail) {
          return reply.conflict('Email already exists')
        }

        if (existingUsername) {
          return reply.conflict('Username already exists')
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
