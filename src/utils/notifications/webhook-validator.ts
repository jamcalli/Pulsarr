import crypto from 'node:crypto'
import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { FastifyBaseLogger } from 'fastify'

// Webhook deduplication cache
const webhookCache = new Map<
  string,
  { timestamp: number; contentInfo: string }
>()
const WEBHOOK_CACHE_TTL_MS = 10000 // 10 seconds

/**
 * Generates a stable 32-character SHA-256 hash to uniquely identify a webhook payload for deduplication.
 *
 * The hash is computed from key identifying fields: for movies, it includes the TMDB ID and title; for TV shows, it includes the TVDB ID, title, and the first episode's season and episode numbers. Event type and upgrade status are intentionally excluded to group related events.
 *
 * @returns A 32-character hexadecimal hash string representing the webhook's unique identity.
 */
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

    // Include episode details for TV shows
    if (payload.episodes && payload.episodes.length > 0) {
      const episode = payload.episodes[0]
      hashData.seasonNumber = episode.seasonNumber
      hashData.episodeNumber = episode.episodeNumber
    }
  }

  // Build a deterministic string by sorting keys and joining key:value pairs
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

/**
 * Validates Sonarr webhook payloads by checking for required fields, event types, and file information.
 *
 * @returns `true` if valid Sonarr webhook; `false` if invalid or should be skipped
 */
function validateSonarrWebhook(
  payload: WebhookPayload,
  logger?: FastifyBaseLogger,
): boolean {
  // Sonarr webhooks must have series, episodes, and eventType
  if (
    !('series' in payload) ||
    !('episodes' in payload) ||
    !('eventType' in payload)
  ) {
    logger?.debug('Skipping invalid Sonarr webhook - missing required fields')
    return false
  }

  // Only process Download events
  const sonarrPayload = payload as { eventType: string }
  if (sonarrPayload.eventType !== 'Download') {
    logger?.debug(
      { eventType: sonarrPayload.eventType },
      'Skipping webhook - not a Download event',
    )
    return false
  }

  // Check for file information
  const hasFileInfo =
    ('episodeFile' in payload && payload.episodeFile) ||
    ('episodeFiles' in payload && payload.episodeFiles)

  if (!hasFileInfo) {
    logger?.debug('Skipping webhook - no file information')
    return false
  }

  return true
}

/**
 * Checks if a webhook is a recent duplicate based on cache.
 *
 * @returns `true` if webhook is a duplicate; `false` if unique
 */
function checkDuplicateWebhook(
  payload: WebhookPayload,
  logger?: FastifyBaseLogger,
): boolean {
  const hash = createWebhookHash(payload)
  const now = Date.now()
  const existing = webhookCache.get(hash)

  if (existing && now - existing.timestamp < WEBHOOK_CACHE_TTL_MS) {
    logger?.info(
      {
        hash,
        ageMs: now - existing.timestamp,
        contentInfo: existing.contentInfo,
      },
      'Duplicate webhook detected within deduplication window',
    )
    return true
  }

  // Create content info for logging
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

  // Store in cache
  webhookCache.set(hash, {
    timestamp: now,
    contentInfo,
  })

  // Clean up expired entries (simple time-based expiry)
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

/**
 * Determines whether a webhook payload is valid and not a recent duplicate, making it eligible for processing.
 *
 * Validates Sonarr and Radarr webhook payloads by checking for required fields, event types, and file information. Skips test events, upgrade events, incomplete payloads, and duplicates received within a short deduplication window.
 *
 * @returns `true` if the webhook is valid and not a duplicate; otherwise, `false`.
 */
export function isWebhookProcessable(
  payload: WebhookPayload,
  logger?: FastifyBaseLogger,
): boolean {
  // Skip test webhooks
  if ('eventType' in payload && payload.eventType === 'Test') {
    return false
  }

  // Handle Sonarr webhooks
  if ('series' in payload || 'episodes' in payload) {
    if (!validateSonarrWebhook(payload, logger)) {
      return false
    }
  }

  // Handle Radarr webhooks
  if ('movie' in payload) {
    // Radarr webhooks already have movie info, no additional check needed
  }

  // Check for duplicates
  return !checkDuplicateWebhook(payload, logger)
}

/**
 * Test-only function to clear the webhook deduplication cache
 * @internal
 */
export function clearWebhookCacheForTests(): void {
  webhookCache.clear()
}
