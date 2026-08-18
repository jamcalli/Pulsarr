import { PROBE_RATE_LIMIT } from '@root/plugins/external/rate-limit.js'
import {
  MaintainerrStatusResponseSchema,
  MaintainerrWebhookErrorSchema,
  MaintainerrWebhookPayloadSchema,
  MaintainerrWebhookResponseSchema,
} from '@root/schemas/notifications/maintainerr-webhook.schema.js'
import {
  type MaintainerrMediaItem,
  processMaintainerrHandledItems,
} from '@services/maintainerr/webhook-processor.js'
import { logRouteError } from '@utils/route-errors.js'
import { safeSecretCompare } from '@utils/webhook-secret.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Process Maintainerr Webhook
  fastify.post(
    '/webhook/maintainerr',
    {
      config: {
        rateLimit: {
          ...PROBE_RATE_LIMIT,
          allowList: (request) =>
            safeSecretCompare(
              request.headers.authorization,
              fastify.config.maintainerrWebhookSecret,
            ),
        },
      },
      schema: {
        security: [{ maintainerrWebhookAuth: [] }],
        summary: 'Process Maintainerr webhook',
        operationId: 'processMaintainerrWebhook',
        description:
          'Process MEDIA_HANDLED webhooks from Maintainerr (3.23.0+) to exclude handled media from watchlist syncing. Requires the webhook secret in the Authorization header.',
        body: MaintainerrWebhookPayloadSchema,
        response: {
          200: MaintainerrWebhookResponseSchema,
          400: MaintainerrWebhookErrorSchema,
          401: MaintainerrWebhookErrorSchema,
          500: MaintainerrWebhookErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      // Maintainerr's webhook agent has a single credential slot which is
      // sent verbatim as the Authorization header
      if (
        !safeSecretCompare(
          request.headers.authorization,
          fastify.config.maintainerrWebhookSecret,
        )
      ) {
        fastify.log.warn(
          { hasSecret: !!request.headers.authorization },
          'Maintainerr webhook rejected - invalid or missing secret',
        )
        return reply.unauthorized('Invalid webhook secret')
      }

      const { notification_type, mediaItems } = request.body

      // Acks TEST_NOTIFICATION and every non-handled event type
      if (notification_type !== 'MEDIA_HANDLED') {
        if (notification_type === 'TEST_NOTIFICATION') {
          fastify.maintainerr.recordTestReceipt()
        }
        fastify.log.debug(
          { notificationType: notification_type },
          'Ignoring non-handled Maintainerr event',
        )
        return { success: true, created: 0 }
      }

      if (!fastify.config.maintainerrEnabled) {
        fastify.log.debug(
          'Ignoring Maintainerr webhook - integration is disabled',
        )
        return { success: true, created: 0 }
      }

      let items: MaintainerrMediaItem[]
      try {
        const parsed = JSON.parse(mediaItems ?? '[]') as MaintainerrMediaItem[]
        if (!Array.isArray(parsed)) {
          throw new Error('mediaItems is not an array')
        }
        items = parsed
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Maintainerr webhook mediaItems is not valid JSON',
        })
        return reply.badRequest('Invalid mediaItems payload')
      }

      try {
        const { created } = await processMaintainerrHandledItems(items, {
          db: fastify.db,
          logger: fastify.log,
          mode: fastify.config.maintainerrExclusionMode,
        })

        if (created > 0) {
          fastify.log.info(
            { created, itemCount: items.length },
            'Created watchlist exclusions from Maintainerr webhook',
          )
        }

        return { success: true, created }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to process Maintainerr webhook',
        })
        return reply.internalServerError(
          'Failed to process Maintainerr webhook',
        )
      }
    },
  )

  // Get Maintainerr Status
  fastify.get(
    '/maintainerr/status',
    {
      schema: {
        summary: 'Get Maintainerr status',
        operationId: 'getMaintainerrStatus',
        description: 'Retrieve the result of the most recent Maintainerr sync',
        response: {
          200: MaintainerrStatusResponseSchema,
        },
        tags: ['Notifications'],
      },
    },
    async () => {
      return { success: true, result: fastify.maintainerr.status }
    },
  )

  // Sync Maintainerr
  fastify.post(
    '/maintainerr/sync',
    {
      schema: {
        summary: 'Sync Maintainerr',
        operationId: 'syncMaintainerr',
        description:
          'Provision the Maintainerr webhook configuration and rule group connections now',
        response: {
          200: MaintainerrStatusResponseSchema,
          500: MaintainerrWebhookErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      try {
        const result = await fastify.maintainerr.reconcile()
        return { success: true, result }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to sync Maintainerr',
        })
        return reply.internalServerError('Failed to sync Maintainerr')
      }
    },
  )
}

export default plugin
