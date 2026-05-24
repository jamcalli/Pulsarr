import {
  CreateWatchlistExclusionResponseSchema,
  CreateWatchlistExclusionSchema,
  GetUserWatchlistExclusionsParamsSchema,
  GetUserWatchlistExclusionsResponseSchema,
  GetWatchlistExclusionsResponseSchema,
  RemoveWatchlistExclusionParamsSchema,
  WatchlistExclusionErrorSchema,
} from '@schemas/watchlist-exclusions/watchlist-exclusions.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Create Watchlist Exclusion
  fastify.post(
    '/',
    {
      schema: {
        summary: 'Create watchlist exclusion',
        operationId: 'createWatchlistExclusion',
        description:
          'Create watchlist exclusion records for a key and set of users',
        body: CreateWatchlistExclusionSchema,
        response: {
          201: CreateWatchlistExclusionResponseSchema,
          400: WatchlistExclusionErrorSchema,
          500: WatchlistExclusionErrorSchema,
        },
        tags: ['Watchlist Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const { key, userIds } = request.body
        const created = await fastify.db.excludeWatchlistItem(key, userIds)

        reply.status(201)
        return {
          success: true,
          message: `Created ${created} exclusion(s)`,
          created,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to create exclusion',
        })
        return reply.internalServerError('Failed to create exclusion')
      }
    },
  )

  // Get All Watchlist Exclusions
  fastify.get(
    '/',
    {
      schema: {
        summary: 'Get all watchlist exclusions',
        operationId: 'getAllWatchlistExclusions',
        description: 'Retrieve all watchlist exclusions with user information',
        response: {
          200: GetWatchlistExclusionsResponseSchema,
          500: WatchlistExclusionErrorSchema,
        },
        tags: ['Watchlist Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const exclusions = await fastify.db.getAllExclusions()

        return {
          success: true,
          message: 'Exclusions retrieved successfully',
          exclusions,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve exclusions',
        })
        return reply.internalServerError('Failed to retrieve exclusions')
      }
    },
  )

  // Get Watchlist Exclusions for User
  fastify.get(
    '/user/:userId',
    {
      schema: {
        summary: 'Get user watchlist exclusions',
        operationId: 'getUserWatchlistExclusions',
        description: 'Retrieve all watchlist exclusions for a specific user',
        params: GetUserWatchlistExclusionsParamsSchema,
        response: {
          200: GetUserWatchlistExclusionsResponseSchema,
          500: WatchlistExclusionErrorSchema,
        },
        tags: ['Watchlist Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const exclusions = await fastify.db.getExclusionsForUser(
          request.params.userId,
        )

        return {
          success: true,
          message: 'User exclusions retrieved successfully',
          exclusions,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve user exclusions',
        })
        return reply.internalServerError('Failed to retrieve user exclusions')
      }
    },
  )

  // Remove Watchlist Exclusion
  fastify.delete(
    '/:id',
    {
      schema: {
        summary: 'Remove watchlist exclusion',
        operationId: 'removeWatchlistExclusion',
        description: 'Remove a watchlist exclusion by ID',
        params: RemoveWatchlistExclusionParamsSchema,
        response: {
          204: { type: 'null', description: 'No Content' },
          404: WatchlistExclusionErrorSchema,
          500: WatchlistExclusionErrorSchema,
        },
        tags: ['Watchlist Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const removed = await fastify.db.removeExclusion(request.params.id)

        if (!removed) {
          return reply.notFound('Exclusion not found')
        }

        reply.status(204)
        return
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to remove exclusion',
        })
        return reply.internalServerError('Failed to remove exclusion')
      }
    },
  )
}

export default plugin
