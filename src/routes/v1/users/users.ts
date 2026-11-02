import {
  CreateUserSchema,
  UpdateUserSchema,
  UserErrorSchema,
  UserResponseSchema,
  UserWithFriendStatusResponseSchema,
} from '@schemas/users/users.schema.js'
import { isUniqueViolation } from '@utils/db-errors.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/',
    {
      schema: {
        summary: 'Create user',
        operationId: 'createUser',
        description: 'Create a new user with the provided information',
        body: CreateUserSchema,
        response: {
          201: UserResponseSchema,
          409: UserErrorSchema,
          500: UserErrorSchema,
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
        // A concurrent create can slip past the pre-check; report it as a 409
        if (isUniqueViolation(error)) {
          return reply.conflict('User with this name already exists')
        }
        logRouteError(fastify.log, request, error, {
          message: 'Failed to create user',
        })
        return reply.internalServerError('Failed to create user')
      }
    },
  )

  fastify.patch(
    '/:id',
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
          200: UserWithFriendStatusResponseSchema,
          404: UserErrorSchema,
          409: UserErrorSchema,
          500: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const user = await fastify.plexWatchlist.updateUser(
          request.params.id,
          request.body,
        )

        return {
          success: true,
          message: 'User updated successfully',
          user,
        }
      } catch (error) {
        if (error instanceof Error && 'statusCode' in error) {
          throw error
        }
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update user',
        })
        return reply.internalServerError('Failed to update user')
      }
    },
  )

  fastify.get(
    '/:id',
    {
      schema: {
        summary: 'Get user by ID',
        operationId: 'getUserById',
        description: 'Retrieve a specific user by their ID',
        params: z.object({
          id: z.coerce.number().int().positive(),
        }),
        response: {
          200: UserWithFriendStatusResponseSchema,
          404: UserErrorSchema,
          500: UserErrorSchema,
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

        const [userWithStatus] = await fastify.plexWatchlist.withFriendStatus([
          user,
        ])

        return {
          success: true,
          message: 'User retrieved successfully',
          user: userWithStatus,
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
