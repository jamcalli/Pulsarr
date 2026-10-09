import {
  GetRoutingFailureSummaryResponseSchema,
  GetRoutingFailuresResponseSchema,
  RetryRoutingFailureParamsSchema,
  RetryRoutingFailuresBodySchema,
  RetryRoutingFailuresResponseSchema,
  RoutingFailureErrorSchema,
  RoutingFailureFiltersSchema,
} from '@schemas/routing-failures/routing-failures.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

function describeRetry(result: {
  resolved: number
  stillFailing: number
  skipped: number
}): string {
  const parts = [
    `${result.resolved} resolved`,
    `${result.stillFailing} still failing`,
  ]
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
  return `Retry finished: ${parts.join(', ')}`
}

async function runRetry(
  fastify: FastifyInstance,
  reply: FastifyReply,
  watchlistItemIds: number[],
) {
  const outcome =
    await fastify.watchlistWorkflow.retryRoutingFailures(watchlistItemIds)

  if (outcome.status === 'not_running') {
    return reply.conflict(
      'The watchlist workflow must be running to retry routing',
    )
  }
  if (outcome.status === 'busy') {
    return reply.conflict('A routing retry is already running')
  }

  return {
    success: true,
    message: describeRetry(outcome.result),
    result: outcome.result,
  }
}

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get Routing Failures
  fastify.get(
    '',
    {
      schema: {
        summary: 'Get routing failures',
        operationId: 'getRoutingFailures',
        description:
          'Retrieve watchlist items that failed to be added to Radarr or Sonarr, optionally filtered by user or category',
        querystring: RoutingFailureFiltersSchema,
        response: {
          200: GetRoutingFailuresResponseSchema,
          500: RoutingFailureErrorSchema,
        },
        tags: ['Routing Failures'],
      },
    },
    async (request, reply) => {
      try {
        const failures = await fastify.db.getRoutingFailures(request.query)

        return {
          success: true,
          message: 'Routing failures retrieved successfully',
          failures,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve routing failures',
        })
        return reply.internalServerError('Failed to retrieve routing failures')
      }
    },
  )

  // Get Routing Failure Summary
  fastify.get(
    '/summary',
    {
      schema: {
        summary: 'Get routing failure summary',
        operationId: 'getRoutingFailureSummary',
        description:
          'Count failed watchlist items overall, per category and per user',
        response: {
          200: GetRoutingFailureSummaryResponseSchema,
          500: RoutingFailureErrorSchema,
        },
        tags: ['Routing Failures'],
      },
    },
    async (request, reply) => {
      try {
        const summary = await fastify.db.getRoutingFailureSummary()

        return {
          success: true,
          message: 'Routing failure summary retrieved successfully',
          summary,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve routing failure summary',
        })
        return reply.internalServerError(
          'Failed to retrieve routing failure summary',
        )
      }
    },
  )

  // Retry Routing Failures
  fastify.post(
    '/retry',
    {
      schema: {
        summary: 'Retry routing failures',
        operationId: 'retryRoutingFailures',
        description:
          'Route every failed watchlist item matching the filters again through the normal routing path. Without a category, items that only miss their IDs are left out.',
        body: RetryRoutingFailuresBodySchema,
        response: {
          200: RetryRoutingFailuresResponseSchema,
          400: RoutingFailureErrorSchema,
          409: RoutingFailureErrorSchema,
          500: RoutingFailureErrorSchema,
        },
        tags: ['Routing Failures'],
      },
    },
    async (request, reply) => {
      try {
        const ids = await fastify.db.getRoutingFailureItemIds(
          request.body ?? {},
        )
        return await runRetry(fastify, reply, ids)
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retry routing failures',
        })
        return reply.internalServerError('Failed to retry routing failures')
      }
    },
  )

  // Retry Routing Failure
  fastify.post(
    '/:watchlistItemId/retry',
    {
      schema: {
        summary: 'Retry routing failure',
        operationId: 'retryRoutingFailure',
        description:
          'Route one failed watchlist item again through the normal routing path',
        params: RetryRoutingFailureParamsSchema,
        response: {
          200: RetryRoutingFailuresResponseSchema,
          404: RoutingFailureErrorSchema,
          409: RoutingFailureErrorSchema,
          500: RoutingFailureErrorSchema,
        },
        tags: ['Routing Failures'],
      },
    },
    async (request, reply) => {
      try {
        const { watchlistItemId } = request.params
        if (!(await fastify.db.hasRoutingFailures(watchlistItemId))) {
          return reply.notFound('No routing failure recorded for this item')
        }
        return await runRetry(fastify, reply, [watchlistItemId])
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retry routing failure',
        })
        return reply.internalServerError('Failed to retry routing failure')
      }
    },
  )
}

export default plugin
