import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  WatchlistWorkflowResponseSchema,
  ErrorSchema,
} from '@schemas/watchlist-workflow/watchlist-workflow.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Start Watchlist Workflow
  fastify.post<{
    Body: { autoStart?: boolean }
    Reply: z.infer<typeof WatchlistWorkflowResponseSchema>
  }>(
    '/start',
    {
      schema: {
        body: z
          .object({
            autoStart: z.boolean().optional(),
          })
          .optional(),
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
          // Start the workflow
          await fastify.watchlistWorkflow.startWorkflow()

          // Check if autoStart parameter is provided and is true
          if (request.body?.autoStart === true) {
            try {
              // Get current config
              const currentConfig = await fastify.db.getConfig(1)
              if (currentConfig) {
                // Update the _isReady flag
                const configUpdate = {
                  ...currentConfig,
                  _isReady: true,
                }

                // Save the updated config
                const dbUpdated = await fastify.db.updateConfig(1, configUpdate)
                if (dbUpdated) {
                  // Update the runtime config if database update was successful
                  const savedConfig = await fastify.db.getConfig(1)
                  if (savedConfig) {
                    await fastify.updateConfig(savedConfig)
                    fastify.log.info('Updated config _isReady to true')
                  }
                } else {
                  fastify.log.warn('Failed to update _isReady config value')
                }
              } else {
                fastify.log.warn('Could not find config to update _isReady')
              }
            } catch (configErr) {
              // Log config update error but don't fail the workflow start
              fastify.log.error('Error updating _isReady config:', configErr)
            }
          }

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
          return reply.internalServerError('Failed to start Watchlist workflow')
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error starting Watchlist workflow:', err)
        return reply.internalServerError('Unable to start Watchlist workflow')
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
        return reply.internalServerError('Unable to stop Watchlist workflow')
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
        return reply.internalServerError(
          'Unable to get Watchlist workflow status',
        )
      }
    },
  )
}

export default plugin
