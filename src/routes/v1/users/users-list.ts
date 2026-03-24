import {
  UserErrorSchema,
  UserListResponseSchema,
  UserListWithCountsResponseSchema,
} from '@schemas/users/users-list.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/users/list',
    {
      schema: {
        summary: 'Get users list',
        operationId: 'getUsersList',
        description: 'Retrieve a list of all users',
        response: {
          200: UserListResponseSchema,
          500: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const users = await fastify.db.getAllUsers()

        reply.status(200)
        return {
          success: true,
          message: 'Users retrieved successfully',
          users,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve users list',
        })
        return reply.internalServerError('Unable to retrieve users')
      }
    },
  )

  fastify.get(
    '/users/list/with-counts',
    {
      schema: {
        summary: 'Get users with watchlist counts',
        operationId: 'getUsersWithCounts',
        description:
          'Retrieve a list of all users including their watchlist item counts',
        response: {
          200: UserListWithCountsResponseSchema,
          500: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const users = await fastify.db.getUsersWithWatchlistCount()

        reply.status(200)
        return {
          success: true,
          message: 'Users with watchlist counts retrieved successfully',
          users,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve users with watchlist counts',
        })
        return reply.internalServerError('Unable to retrieve users with counts')
      }
    },
  )
}

export default plugin
