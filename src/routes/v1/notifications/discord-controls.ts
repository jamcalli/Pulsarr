// File: src/routes/v1/notifications/discord-control.ts
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  DiscordBotResponseSchema,
  WebhookValidationRequestSchema,
  WebhookValidationResponseSchema,
  ErrorSchema,
  type WebhookValidationRequest,
  type WebhookValidationResponse,
} from '@schemas/notifications/discord-control.schema.js'
import { logRouteError } from '@utils/route-errors.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Start Discord Bot
  fastify.post<{
    Reply: z.infer<typeof DiscordBotResponseSchema>
  }>(
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

        logRouteError(fastify.log, request, err, {
          message: 'Failed to start Discord bot',
        })
        return reply.internalServerError('Unable to start Discord bot')
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

        logRouteError(fastify.log, request, err, {
          message: 'Failed to stop Discord bot',
        })
        return reply.internalServerError('Unable to stop Discord bot')
      }
    },
  )

  // Validate Discord Webhooks
  fastify.post<{
    Body: WebhookValidationRequest
    Reply: WebhookValidationResponse
  }>(
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
        const { webhookUrls } = request.body

        // Trim and handle whitespace-only input
        const trimmedInput = webhookUrls.trim()
        if (trimmedInput.length === 0) {
          return reply.badRequest('No webhook URLs provided')
        }

        // Split, trim, filter empty and deduplicate
        const allUrls = trimmedInput
          .split(',')
          .map((url) => url.trim())
          .filter((url) => url.length > 0)

        const uniqueUrls = [...new Set(allUrls)]
        const duplicateCount = allUrls.length - uniqueUrls.length

        // Check for empty URL list after filtering
        if (uniqueUrls.length === 0) {
          return reply.badRequest('No valid webhook URLs provided')
        }

        // Limit the number of URLs to process (prevent DoS)
        const MAX_URLS = 20
        if (uniqueUrls.length > MAX_URLS) {
          return reply.badRequest(
            `Too many webhook URLs. Maximum allowed is ${MAX_URLS}`,
          )
        }

        // Validate each URL
        const results = await Promise.all(
          uniqueUrls.map(async (url) => {
            const result = await fastify.discord.validateWebhook(url)
            return { url, ...result }
          }),
        )

        // Check if all webhooks are valid
        const allValid = results.every((result) => result.valid)

        /**
         * Formats a count and word with correct pluralization.
         *
         * Returns a string combining the given count and the singular or plural form of the specified word, adding "s" if the count is not 1.
         *
         * @param count - The quantity to display.
         * @param word - The word to pluralize.
         * @returns A string with the count and the appropriately pluralized word.
         *
         * @example
         * plural(1, "apple") // "1 apple"
         * plural(3, "apple") // "3 apples"
         */
        function plural(count: number, word: string): string {
          return `${count} ${word}${count === 1 ? '' : 's'}`
        }

        return {
          success: true,
          valid: allValid,
          urls: results,
          duplicateCount: duplicateCount > 0 ? duplicateCount : undefined,
          message: allValid
            ? `Successfully validated ${plural(results.length, 'webhook')}${
                duplicateCount > 0
                  ? ` (${plural(duplicateCount, 'duplicate URL')} removed)`
                  : ''
              }`
            : 'One or more webhooks failed validation',
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        logRouteError(fastify.log, request, err, {
          message: 'Failed to validate webhooks',
        })
        return reply.internalServerError('Unable to validate webhooks')
      }
    },
  )
}

export default plugin
