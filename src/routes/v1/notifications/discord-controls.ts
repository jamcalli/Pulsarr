import {
  DiscordBotResponseSchema,
  ErrorSchema,
  WebhookValidationRequestSchema,
  WebhookValidationResponseSchema,
} from '@schemas/notifications/discord-control.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import type { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Start Discord Bot
  fastify.post(
    '/discordstart',
    {
      schema: {
        summary: 'Start Discord bot',
        operationId: 'startDiscordBot',
        description: 'Start the Discord notification bot service',
        response: {
          200: DiscordBotResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        const status = fastify.notifications.discordBot.getBotStatus()

        if (status !== 'stopped') {
          return reply.badRequest(
            `Cannot start bot: current status is ${status}`,
          )
        }

        const result = await fastify.notifications.discordBot.startBot()

        if (!result) {
          return reply.internalServerError('Failed to start Discord bot')
        }

        const response: z.infer<typeof DiscordBotResponseSchema> = {
          success: true,
          status: 'starting',
          message: 'Discord bot is starting',
        }

        return response
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to start Discord bot',
        })
        return reply.internalServerError('Unable to start Discord bot')
      }
    },
  )

  // Stop Discord Bot
  fastify.post(
    '/discordstop',
    {
      schema: {
        summary: 'Stop Discord bot',
        operationId: 'stopDiscordBot',
        description: 'Stop the Discord notification bot service',
        response: {
          200: DiscordBotResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        const status = fastify.notifications.discordBot.getBotStatus()

        if (status !== 'running' && status !== 'starting') {
          return reply.badRequest(
            `Cannot stop bot: current status is ${status}`,
          )
        }

        const result = await fastify.notifications.discordBot.stopBot()

        if (!result) {
          return reply.internalServerError('Failed to stop Discord bot')
        }

        const response: z.infer<typeof DiscordBotResponseSchema> = {
          success: true,
          status: 'stopping',
          message: 'Discord bot is stopping',
        }

        return response
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to stop Discord bot',
        })
        return reply.internalServerError('Unable to stop Discord bot')
      }
    },
  )

  // Validate Discord Webhooks
  fastify.post(
    '/validatewebhook',
    {
      schema: {
        summary: 'Validate Discord webhooks',
        operationId: 'validateDiscordWebhooks',
        description:
          'Validate one or more Discord webhook URLs for proper functionality',
        body: WebhookValidationRequestSchema,
        response: {
          200: WebhookValidationResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        const outcome =
          await fastify.notifications.discordWebhook.validateWebhooks(
            request.body.webhookUrls,
          )
        if (outcome.status === 'invalid_input') {
          return reply.badRequest(outcome.message)
        }
        return outcome.result
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to validate webhooks',
        })
        return reply.internalServerError('Unable to validate webhooks')
      }
    },
  )
}

export default plugin
