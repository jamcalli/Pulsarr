/**
 * Retry Processor
 *
 * Processes pending webhooks that were stored when no matching media was found.
 * Runs on a schedule to retry matching and send notifications.
 */

import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import type { NotificationService } from '@services/notification.service.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

export interface RetryProcessorDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  notifications: NotificationService
  plexLabelSyncEnabled: boolean
  syncLabelsOnWebhook: ((payload: WebhookPayload) => Promise<void>) | null
}

interface ProcessingState {
  processingWebhooks: boolean
  cleaningUp: boolean
}

/**
 * Delete a webhook and return count (1 if deleted, 0 otherwise)
 */
async function deleteWebhookAndCount(
  webhookId: number | undefined,
  db: DatabaseService,
): Promise<number> {
  if (!webhookId) return 0
  const deleted = await db.deletePendingWebhook(webhookId)
  return deleted ? 1 : 0
}

/**
 * Trigger label sync for content after webhooks are processed
 */
async function triggerLabelSync(
  webhookId: number | undefined,
  payload: unknown,
  mediaType: 'movie' | 'show',
  deps: RetryProcessorDeps,
): Promise<void> {
  const { logger, plexLabelSyncEnabled, syncLabelsOnWebhook } = deps

  if (!plexLabelSyncEnabled || !syncLabelsOnWebhook) {
    return
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return
  }

  try {
    const { WebhookPayloadSchema } = await import(
      '@root/schemas/notifications/webhook.schema.js'
    )
    const parsed = WebhookPayloadSchema.safeParse(payload)
    if (!parsed.success) {
      logger.debug(
        { issues: parsed.error.issues },
        `Skipping invalid webhook payload for ${mediaType} webhook ${webhookId}`,
      )
      return
    }

    await syncLabelsOnWebhook(parsed.data)
  } catch (labelError) {
    logger.error(
      { error: labelError },
      `Error syncing labels for pending ${mediaType} webhook ${webhookId}`,
    )
  }
}

/**
 * Process a single movie webhook
 */
async function processMovieWebhook(
  webhook: { id?: number; guid: string; title: string; payload: unknown },
  deps: RetryProcessorDeps,
): Promise<number> {
  const { db, logger, notifications } = deps

  let moviePayload: unknown
  try {
    moviePayload =
      typeof webhook.payload === 'string'
        ? JSON.parse(webhook.payload)
        : webhook.payload
  } catch (parseError) {
    logger.error(
      { error: parseError },
      `Failed to parse payload for movie webhook ${webhook.id}`,
    )
    return await deleteWebhookAndCount(webhook.id, db)
  }

  const mediaInfo = {
    type: 'movie' as const,
    guid: webhook.guid,
    title: webhook.title,
  }

  const watchlistItems = await db.getWatchlistItemsByGuid(webhook.guid)

  await notifications.sendMediaAvailable(mediaInfo, {
    isBulkRelease: false,
  })

  if (watchlistItems.length > 0) {
    await triggerLabelSync(webhook.id, moviePayload, 'movie', deps)
    logger.debug(
      `Found ${watchlistItems.length} watchlist items for ${webhook.guid}, processed webhook`,
    )
    return await deleteWebhookAndCount(webhook.id, db)
  }

  logger.debug(`No items found for ${webhook.guid}, webhook remains pending`)
  return 0
}

/**
 * Process a single show webhook
 */
async function processShowWebhook(
  webhook: { id?: number; guid: string; title: string; payload: unknown },
  deps: RetryProcessorDeps,
): Promise<number> {
  const { db, logger, notifications } = deps

  let body: unknown
  try {
    body =
      typeof webhook.payload === 'string'
        ? JSON.parse(webhook.payload)
        : webhook.payload
  } catch (parseError) {
    logger.error(
      { error: parseError },
      `Failed to parse payload for webhook ${webhook.id}`,
    )
    const deleted = await deleteWebhookAndCount(webhook.id, db)
    if (deleted > 0) {
      logger.warn(`Deleted webhook ${webhook.id} due to malformed payload`)
    }
    return deleted
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    logger.warn(`Webhook ${webhook.id} payload is not an object; discarding`)
    return await deleteWebhookAndCount(webhook.id, db)
  }

  const payload = body as WebhookPayload

  if (
    !('episodes' in payload) ||
    !Array.isArray(payload.episodes) ||
    payload.episodes.length === 0
  ) {
    return 0
  }

  const mediaInfo = {
    type: 'show' as const,
    guid: webhook.guid,
    title: webhook.title,
    episodes: payload.episodes,
  }

  const watchlistItems = await db.getWatchlistItemsByGuid(webhook.guid)

  await notifications.sendMediaAvailable(mediaInfo, {
    isBulkRelease: payload.episodes.length > 1,
  })

  if (watchlistItems.length > 0) {
    await triggerLabelSync(webhook.id, payload, 'show', deps)
    logger.debug(
      `Found ${watchlistItems.length} watchlist items for ${webhook.guid}, processed webhook`,
    )
    return await deleteWebhookAndCount(webhook.id, db)
  }

  logger.debug(`No items found for ${webhook.guid}, webhook remains pending`)
  return 0
}

/**
 * Process all pending webhooks
 */
export async function processPendingWebhooks(
  state: ProcessingState,
  deps: RetryProcessorDeps,
): Promise<number> {
  const { db, logger } = deps

  if (state.processingWebhooks) {
    logger.debug('Webhook processing already in progress, skipping this cycle')
    return 0
  }

  state.processingWebhooks = true

  try {
    const webhooks = await db.getPendingWebhooks()

    if (webhooks.length === 0) {
      return 0
    }

    const limit = pLimit(5)
    const results = await Promise.allSettled(
      webhooks.map((webhook) =>
        limit(async () => {
          try {
            if (webhook.media_type === 'movie') {
              return await processMovieWebhook(webhook, deps)
            }
            if (webhook.media_type === 'show') {
              return await processShowWebhook(webhook, deps)
            }
            return 0
          } catch (webhookError) {
            logger.error(
              { error: webhookError },
              `Error processing pending webhook ${webhook.id}`,
            )
            return 0
          }
        }),
      ),
    )

    const deletedCount = results.reduce((count, result) => {
      if (result.status === 'fulfilled') return count + result.value
      logger.error(
        { error: result.reason },
        'Webhook processing promise rejected:',
      )
      return count
    }, 0)

    return deletedCount
  } catch (error) {
    logger.error({ error }, 'Error processing pending webhooks:')
    return 0
  } finally {
    state.processingWebhooks = false
  }
}

/**
 * Clean up expired webhooks
 */
export async function cleanupExpiredWebhooks(
  state: ProcessingState,
  deps: RetryProcessorDeps,
): Promise<number> {
  const { db, logger } = deps

  if (state.cleaningUp) {
    logger.debug('Cleanup already in progress, skipping this cycle')
    return 0
  }

  state.cleaningUp = true

  try {
    const deleted = await db.cleanupExpiredWebhooks()
    return deleted
  } catch (error) {
    logger.error({ error }, 'Error cleaning up expired webhooks:')
    return 0
  } finally {
    state.cleaningUp = false
  }
}
