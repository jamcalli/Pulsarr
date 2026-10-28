import crypto from 'node:crypto'
import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { FastifyBaseLogger } from 'fastify'

export type WebhookDedupeCache = Map<
  string,
  { timestamp: number; contentInfo: string }
>

const WEBHOOK_CACHE_TTL_MS = 10_000

// Event type and upgrade status stay out of the hash so related events dedupe together
function createWebhookHash(payload: WebhookPayload): string {
  const hashData: Record<string, string | number> = {
    instanceName: payload.instanceName,
  }

  if ('movie' in payload) {
    hashData.contentType = 'movie'
    hashData.contentId = payload.movie.tmdbId
    hashData.title = payload.movie.title
  } else if ('series' in payload && 'episodes' in payload) {
    hashData.contentType = 'show'
    hashData.contentId = payload.series.tvdbId
    hashData.title = payload.series.title

    if (payload.episodes && payload.episodes.length > 0) {
      const episode = payload.episodes[0]
      hashData.seasonNumber = episode.seasonNumber
      hashData.episodeNumber = episode.episodeNumber
    }
  }

  const sortedKeys = Object.keys(hashData).sort()
  const hashString = sortedKeys
    .map((key) => `${key}:${hashData[key]}`)
    .join('|')
  return crypto
    .createHash('sha256')
    .update(hashString)
    .digest('hex')
    .substring(0, 32)
}

function validateSonarrWebhook(
  payload: WebhookPayload,
  logger?: FastifyBaseLogger,
): boolean {
  if (
    !('series' in payload) ||
    !('episodes' in payload) ||
    !('eventType' in payload)
  ) {
    logger?.debug(
      'Skipping invalid Sonarr webhook with missing required fields',
    )
    return false
  }

  const sonarrPayload = payload as { eventType: string }
  if (sonarrPayload.eventType !== 'Download') {
    logger?.debug(
      { eventType: sonarrPayload.eventType },
      'Skipping webhook that is not a Download event',
    )
    return false
  }

  const hasFileInfo =
    ('episodeFile' in payload && payload.episodeFile) ||
    ('episodeFiles' in payload && payload.episodeFiles)

  if (!hasFileInfo) {
    logger?.debug('Skipping webhook without file information')
    return false
  }

  return true
}

function checkDuplicateWebhook(
  payload: WebhookPayload,
  webhookCache: WebhookDedupeCache,
  logger?: FastifyBaseLogger,
): boolean {
  const hash = createWebhookHash(payload)
  const now = Date.now()
  const existing = webhookCache.get(hash)

  if (existing && now - existing.timestamp < WEBHOOK_CACHE_TTL_MS) {
    logger?.debug(
      {
        hash,
        ageMs: now - existing.timestamp,
        contentInfo: existing.contentInfo,
      },
      'Duplicate webhook detected within deduplication window',
    )
    return true
  }

  let contentInfo: string = payload.instanceName
  if ('movie' in payload) {
    contentInfo = `${payload.movie.title} (${payload.movie.tmdbId})`
  } else if (
    'series' in payload &&
    'episodes' in payload &&
    payload.episodes.length > 0
  ) {
    const episode = payload.episodes[0]
    contentInfo = `${payload.series.title} S${episode.seasonNumber}E${episode.episodeNumber} (${payload.series.tvdbId})`
  }

  webhookCache.set(hash, {
    timestamp: now,
    contentInfo,
  })

  const expiredKeys: string[] = []
  for (const [key, entry] of webhookCache.entries()) {
    if (now - entry.timestamp > WEBHOOK_CACHE_TTL_MS) {
      expiredKeys.push(key)
    }
  }
  for (const key of expiredKeys) {
    webhookCache.delete(key)
  }

  logger?.debug(
    { hash, contentInfo, cacheSize: webhookCache.size },
    'Webhook marked as processable and cached',
  )

  return false
}

/** Skips test events, Sonarr payloads without a downloaded file, and duplicates inside the dedupe window. */
export function isWebhookProcessable(
  payload: WebhookPayload,
  webhookCache: WebhookDedupeCache,
  logger?: FastifyBaseLogger,
): boolean {
  if ('eventType' in payload && payload.eventType === 'Test') {
    return false
  }

  if ('series' in payload || 'episodes' in payload) {
    if (!validateSonarrWebhook(payload, logger)) {
      return false
    }
  }

  return !checkDuplicateWebhook(payload, webhookCache, logger)
}
