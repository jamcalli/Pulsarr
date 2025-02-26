// File: src/routes/v1/notifications/discord-control.ts
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  DiscordBotResponseSchema,
  ErrorSchema,
} from '@schemas/notifications/discord-control.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Start Discord Bot
  fastify.post<{
    Reply: z.infer<typeof DiscordBotResponseSchema>
  }>(
    '/discordstart',
    {
      schema: {
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
        const status = fastify.discord.getBotStatus()

        if (status !== 'stopped') {
          return reply.badRequest(
            `Cannot start bot: current status is ${status}`,
          )
        }

        const result = await fastify.discord.startBot()

        if (!result) {
          return reply.internalServerError('Failed to start Discord bot')
        }

        const response: z.infer<typeof DiscordBotResponseSchema> = {
          success: true,
          status: 'starting',
          message: 'Discord bot is starting',
        }

        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error starting Discord bot:', err)
        throw reply.internalServerError('Unable to start Discord bot')
      }
    },
  )

  // Stop Discord Bot
  fastify.post<{
    Reply: z.infer<typeof DiscordBotResponseSchema>
  }>(
    '/discordstop',
    {
      schema: {
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
        const status = fastify.discord.getBotStatus()

        if (status !== 'running' && status !== 'starting') {
          return reply.badRequest(
            `Cannot stop bot: current status is ${status}`,
          )
        }

        const result = await fastify.discord.stopBot()

        if (!result) {
          return reply.internalServerError('Failed to stop Discord bot')
        }

        const response: z.infer<typeof DiscordBotResponseSchema> = {
          success: true,
          status: 'stopping',
          message: 'Discord bot is stopping',
        }

        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error stopping Discord bot:', err)
        throw reply.internalServerError('Unable to stop Discord bot')
      }
    },
  )
}

export default plugin
