import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { FastifyInstance } from 'fastify'

/**
 * Persistently records a webhook for later handling when no matching media item is found.
 *
 * Computes an expiration timestamp using fastify.pendingWebhooks.config.maxAge (minutes) and falls back to 10 minutes if the configured value is invalid or non-positive. Attempts to insert a pending webhook record into the database containing the provided metadata and payload. Database insertion errors are logged but intentionally swallowed so the caller does not retry and cause duplicate webhook deliveries.
 *
 * @param data - Webhook metadata and payload to store (instanceType, instanceId, guid, title, mediaType, payload)
 * @returns A promise that resolves when the queue attempt (successful or logged failure) completes.
 */
export async function queuePendingWebhook(
  fastify: FastifyInstance,
  data: {
    instanceType: 'radarr' | 'sonarr'
    instanceId: number | null
    guid: string
    title: string
    mediaType: 'movie' | 'show'
    payload: WebhookPayload
  },
): Promise<void> {
  const cfgMaxAge = Number(fastify.pendingWebhooks?.config?.maxAge)
  const maxAgeMinutes =
    Number.isFinite(cfgMaxAge) && cfgMaxAge > 0 ? cfgMaxAge : 10
  const expires = new Date(Date.now() + maxAgeMinutes * 60_000)

  try {
    await fastify.db.createPendingWebhook({
      instance_type: data.instanceType,
      instance_id: data.instanceId,
      guid: data.guid,
      title: data.title,
      media_type: data.mediaType,
      payload: data.payload,
      expires_at: expires,
    })

    fastify.log.debug(
      {
        guid: data.guid,
        instanceType: data.instanceType,
        instanceId: data.instanceId,
        mediaType: data.mediaType,
        title: data.title,
        expiresAt: expires.toISOString(),
      },
      'Queued pending webhook (no matching items)',
    )
  } catch (error) {
    fastify.log.error(
      { error, guid: data.guid, title: data.title },
      `Failed to create pending webhook for ${data.mediaType}, but returning success to prevent resends`,
    )
    // Still return success to prevent webhook resends
  }
}
