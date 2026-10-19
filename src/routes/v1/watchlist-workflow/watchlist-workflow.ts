import { MessageResponseSchema } from '@schemas/common/message.schema.js'
import {
  ErrorSchema,
  StartWorkflowBodySchema,
  WatchlistWorkflowResponseSchema,
  type WatchlistWorkflowStatus,
  WatchlistWorkflowStatusSchema,
} from '@schemas/watchlist-workflow/watchlist-workflow.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import type { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Start Watchlist Workflow
  fastify.post<{
    Body: { autoStart?: boolean }
    Reply: z.infer<typeof WatchlistWorkflowResponseSchema>
  }>(
    '/start',
    {
      schema: {
        summary: 'Start watchlist workflow',
        operationId: 'startWatchlistWorkflow',
        description:
          'Start the watchlist processing workflow. Holds the request open until the initial sync finishes, so use POST /v1/watchlist-workflow/start-background instead.',
        deprecated: true,
        body: StartWorkflowBodySchema,
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
          await fastify.watchlistWorkflow.startWorkflow()

          await fastify.watchlistWorkflow.persistAutoStart(
            request.body?.autoStart,
          )

          const response: z.infer<typeof WatchlistWorkflowResponseSchema> = {
            success: true,
            status: 'starting',
            message: 'Watchlist workflow is starting',
          }
          return response
        } catch (startErr) {
          // This is where we need to check if it's a real error or just RSS fallback
          if (fastify.watchlistWorkflow.getStatus() === 'running') {
            const response: z.infer<typeof WatchlistWorkflowResponseSchema> = {
              success: true,
              status: 'starting',
              message: 'Watchlist workflow is starting in manual sync mode',
            }
            return response
          }
          logRouteError(fastify.log, request, startErr, {
            message: 'Failed to start Watchlist workflow (no fallback)',
          })
          return reply.internalServerError('Failed to start Watchlist workflow')
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to start Watchlist workflow',
        })
        return reply.internalServerError('Unable to start Watchlist workflow')
      }
    },
  )

  // Start Watchlist Workflow in the background
  fastify.post(
    '/start-background',
    {
      schema: {
        summary: 'Start watchlist workflow in the background',
        operationId: 'startWatchlistWorkflowInBackground',
        description:
          'Starts the watchlist processing workflow and returns at once. The status route and the watchlist-workflow-status event report when it runs, or lastError when the start fails.',
        body: StartWorkflowBodySchema,
        response: {
          202: MessageResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Watchlist Workflow'],
      },
    },
    async (request, reply) => {
      try {
        const status = fastify.watchlistWorkflow.getStatus()
        if (
          !fastify.watchlistWorkflow.startInBackground(request.body?.autoStart)
        ) {
          return reply.badRequest(
            `Cannot start workflow: current status is ${status}`,
          )
        }
        return reply
          .status(202)
          .send({ message: 'Watchlist workflow is starting' })
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to start Watchlist workflow',
        })
        return reply.internalServerError('Unable to start Watchlist workflow')
      }
    },
  )

  // Stop Watchlist Workflow
  fastify.post(
    '/stop',
    {
      schema: {
        summary: 'Stop watchlist workflow',
        operationId: 'stopWatchlistWorkflow',
        description: 'Stop the currently running watchlist processing workflow',
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
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to stop Watchlist workflow',
        })
        return reply.internalServerError('Unable to stop Watchlist workflow')
      }
    },
  )

  // Get Watchlist Workflow Status
  fastify.get(
    '/status',
    {
      schema: {
        summary: 'Get watchlist workflow status',
        operationId: 'getWatchlistWorkflowStatus',
        description:
          'Retrieve the current status of the watchlist processing workflow',
        response: {
          200: WatchlistWorkflowStatusSchema,
          500: ErrorSchema,
        },
        tags: ['Watchlist Workflow'],
      },
    },
    async (request, reply) => {
      try {
        const status = fastify.watchlistWorkflow.getStatus()

        const response: WatchlistWorkflowStatus = {
          success: true,
          status,
          message: `Watchlist workflow is ${status}`,
          lastError: fastify.watchlistWorkflow.getLastError(),
        }
        return response
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get Watchlist workflow status',
        })
        return reply.internalServerError(
          'Unable to get Watchlist workflow status',
        )
      }
    },
  )
}

export default plugin
