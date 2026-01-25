/**
 * Pending Store
 *
 * Persists webhooks for later processing when no matching media is found.
 */

import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface PendingStoreDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  maxAgeMinutes: number
}

export interface PendingWebhookParams {
  instanceType: 'radarr' | 'sonarr'
  instanceId: number | null
  guid: string
  title: string
  mediaType: 'movie' | 'show'
  payload: WebhookPayload
}

/**
 * Persistently records a webhook for later handling when no matching media item is found.
 *
 * Computes an expiration timestamp using maxAgeMinutes and falls back to 10 minutes
 * if the configured value is invalid. Database insertion errors are logged but
 * intentionally swallowed so the caller does not retry and cause duplicate deliveries.
 */
export async function queuePendingWebhook(
  params: PendingWebhookParams,
  deps: PendingStoreDeps,
): Promise<void> {
  const { db, logger, maxAgeMinutes } = deps
  const effectiveMaxAge =
    Number.isFinite(maxAgeMinutes) && maxAgeMinutes > 0 ? maxAgeMinutes : 10
  const expires = new Date(Date.now() + effectiveMaxAge * 60_000)

  try {
    await db.createPendingWebhook({
      instance_type: params.instanceType,
      instance_id: params.instanceId,
      guid: params.guid,
      title: params.title,
      media_type: params.mediaType,
      payload: params.payload,
      expires_at: expires,
    })

    logger.debug(
      {
        guid: params.guid,
        instanceType: params.instanceType,
        instanceId: params.instanceId,
        mediaType: params.mediaType,
        title: params.title,
        expiresAt: expires.toISOString(),
      },
      'Queued pending webhook (no matching items)',
    )
  } catch (error) {
    logger.error(
      { error, guid: params.guid, title: params.title },
      `Failed to create pending webhook for ${params.mediaType}, but returning success to prevent resends`,
    )
  }
}
