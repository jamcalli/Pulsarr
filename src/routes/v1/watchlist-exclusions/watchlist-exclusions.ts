import {
  CreateWatchlistExclusionResponseSchema,
  CreateWatchlistExclusionSchema,
  GetUserWatchlistExclusionsParamsSchema,
  GetUserWatchlistExclusionsResponseSchema,
  GetWatchlistExclusionsResponseSchema,
  RemoveWatchlistExclusionParamsSchema,
  WatchlistExclusionBulkCreateResponseSchema,
  WatchlistExclusionBulkCreateSchema,
  WatchlistExclusionBulkRemoveResponseSchema,
  WatchlistExclusionBulkRemoveSchema,
  WatchlistExclusionErrorSchema,
  WatchlistExclusionItemsQuerySchema,
  WatchlistExclusionItemsResponseSchema,
} from '@schemas/watchlist-exclusions/watchlist-exclusions.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Create Watchlist Exclusion
  fastify.post(
    '',
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
        const { key, userIds, title, type, guids } = request.body
        const created = await fastify.db.excludeWatchlistItem(
          key,
          userIds,
          title,
          type,
          guids,
        )

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
    '',
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

  // List watchlist items with their exclusion state
  fastify.get(
    '/items',
    {
      schema: {
        summary: 'List watchlist items with their exclusion state',
        operationId: 'getWatchlistExclusionItems',
        description:
          'Page through every watchlist item joined to its own and global exclusions, plus exclusions whose watchlist item is gone',
        querystring: WatchlistExclusionItemsQuerySchema,
        response: {
          200: WatchlistExclusionItemsResponseSchema,
          400: WatchlistExclusionErrorSchema,
          500: WatchlistExclusionErrorSchema,
        },
        tags: ['Watchlist Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const [items, total] = await Promise.all([
          fastify.db.getWatchlistExclusionItems(request.query),
          fastify.db.getWatchlistExclusionItemsCount(request.query),
        ])

        return {
          success: true,
          message: 'Watchlist exclusion items retrieved successfully',
          items,
          total,
          limit: request.query.limit,
          offset: request.query.offset,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve watchlist exclusion items',
        })
        return reply.internalServerError(
          'Failed to retrieve watchlist exclusion items',
        )
      }
    },
  )

  // Bulk create watchlist exclusions
  fastify.post(
    '/bulk',
    {
      schema: {
        summary: 'Bulk create watchlist exclusions',
        operationId: 'bulkCreateWatchlistExclusions',
        description:
          'Exclude several watchlist items for their users, or globally for every user',
        body: WatchlistExclusionBulkCreateSchema,
        response: {
          200: WatchlistExclusionBulkCreateResponseSchema,
          400: WatchlistExclusionErrorSchema,
          500: WatchlistExclusionErrorSchema,
        },
        tags: ['Watchlist Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const { items, scope } = request.body
        const result = await fastify.db.bulkExcludeWatchlistItems(items, scope)

        return {
          success: true,
          message: `Bulk exclude completed: ${result.created} created, ${result.skipped} skipped, ${result.failed.length} failed`,
          result: { ...result, total: items.length },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to bulk create exclusions',
          itemCount: request.body.items.length,
        })
        return reply.internalServerError('Failed to bulk create exclusions')
      }
    },
  )

  // Bulk remove watchlist exclusions
  fastify.post(
    '/bulk/remove',
    {
      schema: {
        summary: 'Bulk remove watchlist exclusions',
        operationId: 'bulkRemoveWatchlistExclusions',
        description: 'Remove several watchlist exclusions by ID',
        body: WatchlistExclusionBulkRemoveSchema,
        response: {
          200: WatchlistExclusionBulkRemoveResponseSchema,
          400: WatchlistExclusionErrorSchema,
          500: WatchlistExclusionErrorSchema,
        },
        tags: ['Watchlist Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const { ids } = request.body
        const result = await fastify.db.bulkRemoveExclusions(ids)

        return {
          success: true,
          message: `Bulk remove completed: ${result.removed} removed, ${result.failed.length} failed`,
          result,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to bulk remove exclusions',
          idCount: request.body.ids.length,
        })
        return reply.internalServerError('Failed to bulk remove exclusions')
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
