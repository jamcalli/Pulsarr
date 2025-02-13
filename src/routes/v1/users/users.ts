import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  CreateUserSchema,
  CreateUserResponseSchema,
  UpdateUserSchema,
  UpdateUserResponseSchema,
  UserErrorSchema,
} from '@schemas/users/users.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof CreateUserSchema>
    Reply:
      | z.infer<typeof CreateUserResponseSchema>
      | z.infer<typeof UserErrorSchema>
  }>(
    '/users',
    {
      schema: {
        body: CreateUserSchema,
        response: {
          201: CreateUserResponseSchema,
          409: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const existingUser = await fastify.db.getUser(request.body.name)
        if (existingUser) {
          reply.status(409)
          return {
            success: false,
            message: 'User with this name already exists',
          }
        }

        const user = await fastify.db.createUser(request.body)

        reply.status(201)
        return {
          success: true,
          message: 'User created successfully',
          user,
        }
      } catch (error) {
        throw reply.internalServerError('Failed to create user')
      }
    },
  )

  fastify.patch<{
    Params: { id: string }
    Body: z.infer<typeof UpdateUserSchema>
    Reply:
      | z.infer<typeof UpdateUserResponseSchema>
      | z.infer<typeof UserErrorSchema>
  }>(
    '/users/:id',
    {
      schema: {
        params: z.object({
          id: z.string(),
        }),
        body: UpdateUserSchema,
        response: {
          200: UpdateUserResponseSchema,
          404: UserErrorSchema,
          409: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      const userId = Number.parseInt(request.params.id, 10)

      try {
        const existingUser = await fastify.db.getUser(userId)
        if (!existingUser) {
          reply.status(404)
          return {
            success: false,
            message: 'User not found',
          }
        }

        if (request.body.name && request.body.name !== existingUser.name) {
          const nameExists = await fastify.db.getUser(request.body.name)
          if (nameExists) {
            reply.status(409)
            return {
              success: false,
              message: 'User with this name already exists',
            }
          }
        }

        const updated = await fastify.db.updateUser(userId, request.body)
        if (!updated) {
          throw new Error('Failed to update user')
        }

        const updatedUser = await fastify.db.getUser(userId)
        if (!updatedUser) {
          throw new Error('Failed to fetch updated user')
        }

        return {
          success: true,
          message: 'User updated successfully',
          user: updatedUser,
        }
      } catch (error) {
        throw reply.internalServerError('Failed to update user')
      }
    },
  )

  fastify.get<{
    Params: { id: string }
    Reply:
      | z.infer<typeof CreateUserResponseSchema>
      | z.infer<typeof UserErrorSchema>
  }>(
    '/users/:id',
    {
      schema: {
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: CreateUserResponseSchema,
          404: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const user = await fastify.db.getUser(Number.parseInt(request.params.id, 10))
        if (!user) {
          reply.status(404)
          return {
            success: false,
            message: 'User not found',
          }
        }

        return {
          success: true,
          message: 'User retrieved successfully',
          user,
        }
      } catch (error) {
        throw reply.internalServerError('Failed to retrieve user')
      }
    },
  )
}

export default plugin
