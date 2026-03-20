import {
  CreateUserSchema,
  UpdateUserSchema,
  UserErrorSchema,
  UserResponseSchema,
} from '@schemas/users/users.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/users',
    {
      schema: {
        summary: 'Create user',
        operationId: 'createUser',
        description: 'Create a new user with the provided information',
        body: CreateUserSchema,
        response: {
          201: UserResponseSchema,
          409: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const existingUser = await fastify.db.getUser(request.body.name)
        if (existingUser) {
          return reply.conflict('User with this name already exists')
        }

        const user = await fastify.db.createUser({
          ...request.body,
          is_primary_token: false,
        })

        reply.status(201)
        return {
          success: true,
          message: 'User created successfully',
          user,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to create user',
        })
        return reply.internalServerError('Failed to create user')
      }
    },
  )

  fastify.patch(
    '/users/:id',
    {
      schema: {
        summary: 'Update user',
        operationId: 'updateUser',
        description: 'Update an existing user by ID',
        params: z.object({
          id: z.coerce.number().int().positive(),
        }),
        body: UpdateUserSchema,
        response: {
          200: UserResponseSchema,
          404: UserErrorSchema,
          409: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      const userId = request.params.id

      try {
        const existingUser = await fastify.db.getUser(userId)
        if (!existingUser) {
          return reply.notFound('User not found')
        }

        if (request.body.name && request.body.name !== existingUser.name) {
          const nameExists = await fastify.db.getUser(request.body.name)
          if (nameExists) {
            return reply.conflict('User with this name already exists')
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
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update user',
        })
        return reply.internalServerError('Failed to update user')
      }
    },
  )

  fastify.get(
    '/users/:id',
    {
      schema: {
        summary: 'Get user by ID',
        operationId: 'getUserById',
        description: 'Retrieve a specific user by their ID',
        params: z.object({
          id: z.coerce.number().int().positive(),
        }),
        response: {
          200: UserResponseSchema,
          404: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const user = await fastify.db.getUser(request.params.id)
        if (!user) {
          return reply.notFound('User not found')
        }

        return {
          success: true,
          message: 'User retrieved successfully',
          user,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve user',
        })
        return reply.internalServerError('Failed to retrieve user')
      }
    },
  )
}

export default plugin
