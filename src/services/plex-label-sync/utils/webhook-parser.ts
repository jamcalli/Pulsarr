/**
 * Webhook Parser Utilities
 *
 * Provides functions to extract relevant information from Radarr/Sonarr webhook payloads.
 */

import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Extracts tags from webhook payload
 *
 * @param webhook - The webhook payload
 * @param logger - Logger instance for error logging
 * @returns Array of tag strings, or empty array if not extractable
 */
export function extractTagsFromWebhook(
  webhook: WebhookPayload,
  logger: FastifyBaseLogger,
): string[] {
  try {
    if ('eventType' in webhook && webhook.eventType === 'Test') {
      return []
    }

    if ('movie' in webhook && webhook.movie.tags) {
      // Radarr webhook
      return webhook.movie.tags.map(String)
    }

    if ('series' in webhook && webhook.series.tags) {
      // Sonarr webhook
      return webhook.series.tags.map(String)
    }

    return []
  } catch (error) {
    logger.error({ error }, 'Error extracting tags from webhook:')
    return []
  }
}

/**
 * Extracts content GUID array and type from webhook payload
 *
 * @param webhook - The webhook payload
 * @param logger - Logger instance for error logging
 * @returns Object containing GUID array and content type, or null if not extractable
 */
export function extractContentGuidFromWebhook(
  webhook: WebhookPayload,
  logger: FastifyBaseLogger,
): { guids: string[]; contentType: 'movie' | 'show' } | null {
  try {
    if ('eventType' in webhook && webhook.eventType === 'Test') {
      return null
    }

    if ('movie' in webhook) {
      // Radarr webhook
      return {
        guids: [`tmdb:${webhook.movie.tmdbId}`],
        contentType: 'movie',
      }
    }

    if ('series' in webhook) {
      // Sonarr webhook
      return {
        guids: [`tvdb:${webhook.series.tvdbId}`],
        contentType: 'show',
      }
    }

    return null
  } catch (error) {
    logger.error({ error }, 'Error extracting content GUID from webhook:')
    return null
  }
}
