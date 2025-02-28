import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  WatchlistWorkflowResponseSchema,
  ErrorSchema,
} from '@schemas/watchlist-workflow/watchlist-workflow.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Start Watchlist Workflow
  fastify.post<{
    Reply: z.infer<typeof WatchlistWorkflowResponseSchema>
  }>(
    '/start',
    {
      schema: {
        response: {
          200: WatchlistWorkflowResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Watchlist Workflow'],
      },
    },
    async (request, reply) => {
      try {
        const status = fastify.watchlistWorkflow.getStatus()
        if (status !== 'stopped') {
          return reply.badRequest(
            `Cannot start workflow: current status is ${status}`,
          )
        }

        try {
          fastify.watchlistWorkflow.startWorkflow().catch((err) => {
            fastify.log.error('Error in background workflow startup:', err)
          })

          const response: z.infer<typeof WatchlistWorkflowResponseSchema> = {
            success: true,
            status: 'starting',
            message: 'Watchlist workflow is starting',
          }
          return response
        } catch (startErr) {
          return reply.internalServerError('Failed to start Watchlist workflow')
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error starting Watchlist workflow:', err)
        throw reply.internalServerError('Unable to start Watchlist workflow')
      }
    },
  )

  // Stop Watchlist Workflow
  fastify.post<{
    Reply: z.infer<typeof WatchlistWorkflowResponseSchema>
  }>(
    '/stop',
    {
      schema: {
        response: {
          200: WatchlistWorkflowResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Watchlist Workflow'],
      },
    },
    async (request, reply) => {
      try {
        const status = fastify.watchlistWorkflow.getStatus()
        if (status !== 'running' && status !== 'starting') {
          return reply.badRequest(
            `Cannot stop workflow: current status is ${status}`,
          )
        }

        const result = await fastify.watchlistWorkflow.stop()
        if (!result) {
          return reply.internalServerError('Failed to stop Watchlist workflow')
        }

        const response: z.infer<typeof WatchlistWorkflowResponseSchema> = {
          success: true,
          status: 'stopping',
          message: 'Watchlist workflow is stopping',
        }
        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error stopping Watchlist workflow:', err)
        throw reply.internalServerError('Unable to stop Watchlist workflow')
      }
    },
  )

  // Get Watchlist Workflow Status
  fastify.get<{
    Reply: z.infer<typeof WatchlistWorkflowResponseSchema>
  }>(
    '/status',
    {
      schema: {
        response: {
          200: WatchlistWorkflowResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Watchlist Workflow'],
      },
    },
    async (request, reply) => {
      try {
        const status = fastify.watchlistWorkflow.getStatus()

        const response: z.infer<typeof WatchlistWorkflowResponseSchema> = {
          success: true,
          status,
          message: `Watchlist workflow is ${status}`,
        }
        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error getting Watchlist workflow status:', err)
        throw reply.internalServerError(
          'Unable to get Watchlist workflow status',
        )
      }
    },
  )
}

export default plugin
