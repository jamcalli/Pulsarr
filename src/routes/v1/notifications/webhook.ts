import { PROBE_RATE_LIMIT } from '@root/plugins/external/rate-limit.js'
import type {
  RadarrPayload,
  SonarrPayload,
} from '@root/schemas/notifications/webhook.schema.js'
import {
  ErrorSchema,
  WebhookPayloadSchema,
  WebhookQuerySchema,
  WebhookResponseSchema,
} from '@root/schemas/notifications/webhook.schema.js'
import { isWebhookProcessable } from '@utils/arr-webhook-validator.js'
import { episodeRange } from '@utils/episode-code.js'
import { createServiceLogger } from '@utils/logger.js'
import { logRouteError } from '@utils/route-errors.js'
import { safeSecretCompare } from '@utils/webhook-secret.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  const log = createServiceLogger(fastify.log, 'WEBHOOK')

  fastify.post(
    '/webhook',
    {
      config: {
        rateLimit: {
          ...PROBE_RATE_LIMIT,
          // Valid-secret senders are exempt - never throttle a legitimate
          // import burst; the bucket only binds bad or missing secrets
          allowList: (request) =>
            safeSecretCompare(
              request.headers['x-pulsarr-secret'],
              fastify.config.webhookSecret,
            ),
        },
      },
      schema: {
        security: [{ webhookSecretAuth: [] }],
        summary: 'Process media webhook',
        operationId: 'processMediaWebhook',
        description:
          'Process webhooks from Radarr (movies) or Sonarr (TV series) for media notifications. Requires X-Pulsarr-Secret header for authentication.',
        body: WebhookPayloadSchema,
        querystring: WebhookQuerySchema,
        response: {
          200: WebhookResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Notifications'],
      },
    },
    async (request, reply) => {
      const { body } = request
      const instanceId = request.query.instanceId

      // Validate webhook secret (timing-safe comparison)
      const providedSecret = request.headers['x-pulsarr-secret']
      if (!safeSecretCompare(providedSecret, fastify.config.webhookSecret)) {
        log.warn(
          { hasSecret: !!providedSecret },
          'Webhook rejected because the secret is invalid or missing',
        )
        return reply.unauthorized('Invalid webhook secret')
      }

      if ('eventType' in body && body.eventType === 'Test') {
        log.debug('Received test webhook')
        return { success: true }
      }

      if (!isWebhookProcessable(body, fastify.log)) {
        log.debug(
          {
            instanceName: body.instanceName,
            eventType: 'eventType' in body ? body.eventType : 'unknown',
          },
          'Webhook skipped by deduplication filter',
        )
        return { success: true }
      }

      try {
        // Trigger Plex label sync (fire and forget)
        fastify.webhookQueue.triggerLabelSync(body)

        if ('movie' in body) {
          const instance = instanceId
            ? await fastify.db.getRadarrInstanceByIdentifier(instanceId)
            : null

          log.debug(
            {
              instanceId,
              foundInstance: !!instance,
              instanceName: instance?.name,
            },
            'Radarr instance lookup result',
          )
          log.info(
            { instanceId: instance?.id },
            `${instance?.name ?? body.instanceName}: ${body.movie.title} downloaded`,
          )

          await fastify.webhookQueue.handleMovieWebhook(
            body as RadarrPayload,
            instance,
          )
          return { success: true }
        }

        if (
          'series' in body &&
          'episodes' in body &&
          Array.isArray(body.episodes) &&
          body.episodes.length > 0
        ) {
          const instance = instanceId
            ? await fastify.db.getSonarrInstanceByIdentifier(instanceId)
            : null

          log.debug(
            {
              instanceId,
              foundInstance: !!instance,
              instanceName: instance?.name,
            },
            'Sonarr instance lookup result',
          )
          log.info(
            { instanceId: instance?.id },
            `${instance?.name ?? body.instanceName}: ${body.series.title} ${episodeRange(body.episodes)} downloaded`,
          )

          await fastify.webhookQueue.handleSonarrWebhook(
            body as SonarrPayload,
            instance,
          )
          return { success: true }
        }

        return reply.badRequest('Invalid webhook payload')
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to process webhook',
          instanceName: body.instanceName,
        })
        return reply.internalServerError('Error processing webhook')
      }
    },
  )
}

export default plugin
