import { ErrorSchema } from '@schemas/common/error.schema.js'
import { TestResultSchema } from '@schemas/common/test-result.schema.js'
import {
  AppriseTestPayloadSchema,
  DiscordDmTestPayloadSchema,
  DiscordWebhookTestPayloadSchema,
  SystemTestPayloadSchema,
  UserTestParamsSchema,
  UserTestPayloadSchema,
} from '@schemas/notifications/test-notification.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Test Apprise URL
  fastify.post(
    '/test/apprise',
    {
      schema: {
        summary: 'Test Apprise URL',
        operationId: 'testAppriseNotification',
        description: 'Send a test notification to an Apprise URL, saved or not',
        body: AppriseTestPayloadSchema,
        response: {
          200: TestResultSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        return await fastify.notifications.apprise.testNotification(
          request.body.url,
        )
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to test Apprise notification',
        })
        return reply.internalServerError('Failed to test Apprise notification')
      }
    },
  )

  // Test Discord webhook URL
  fastify.post(
    '/test/discord-webhook',
    {
      schema: {
        summary: 'Test Discord webhook',
        operationId: 'testDiscordWebhookNotification',
        description:
          'Post a test message to a Discord webhook URL, saved or not',
        body: DiscordWebhookTestPayloadSchema,
        response: {
          200: TestResultSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        return await fastify.notifications.discordWebhook.testNotification(
          request.body.url,
        )
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to test Discord webhook',
        })
        return reply.internalServerError('Failed to test Discord webhook')
      }
    },
  )

  // Test Discord direct message
  fastify.post(
    '/test/discord-dm',
    {
      schema: {
        summary: 'Test Discord direct message',
        operationId: 'testDiscordDmNotification',
        description:
          'Send a test direct message to a Discord user through the running bot',
        body: DiscordDmTestPayloadSchema,
        response: {
          200: TestResultSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        return await fastify.notifications.discordBot.testNotification(
          request.body.discordId,
        )
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to test Discord direct message',
        })
        return reply.internalServerError(
          'Failed to test Discord direct message',
        )
      }
    },
  )

  // Test saved system notification setting
  fastify.post(
    '/test/system',
    {
      schema: {
        summary: 'Test saved system notification',
        operationId: 'testSystemNotification',
        description:
          'Send a test notification to every URL saved in a system notification setting',
        body: SystemTestPayloadSchema,
        response: {
          200: TestResultSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        return await fastify.notifications.testSystemTarget(request.body.target)
      } catch (error) {
        if (error instanceof Error && 'statusCode' in error) {
          throw error
        }
        logRouteError(fastify.log, request, error, {
          message: 'Failed to test system notification',
          context: { target: request.body.target },
        })
        return reply.internalServerError('Failed to test system notification')
      }
    },
  )

  // Test saved user notification channel
  fastify.post(
    '/test/users/:userId',
    {
      schema: {
        summary: 'Test saved user notification',
        operationId: 'testUserNotification',
        description:
          'Send a test notification through a channel saved on a user',
        params: UserTestParamsSchema,
        body: UserTestPayloadSchema,
        response: {
          200: TestResultSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        return await fastify.notifications.testUserChannel(
          request.params.userId,
          request.body.channel,
        )
      } catch (error) {
        if (error instanceof Error && 'statusCode' in error) {
          throw error
        }
        logRouteError(fastify.log, request, error, {
          message: 'Failed to test user notification',
          context: {
            userId: request.params.userId,
            channel: request.body.channel,
          },
        })
        return reply.internalServerError('Failed to test user notification')
      }
    },
  )
}

export default plugin
