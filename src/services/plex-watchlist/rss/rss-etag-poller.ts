/**
 * RSS ETag-based Change Detection
 *
 * Provides efficient RSS feed change detection using HEAD requests with ETag.
 * Instead of fetching full RSS payloads (~37KB each), this uses HEAD requests
 * with If-None-Match to detect changes with minimal bandwidth (~1KB).
 *
 * When a change is detected, the existing ETag reconciliation flow handles
 * identifying WHO changed and WHAT was added via discover/GraphQL APIs.
 *
 * @see fixes/rss-etag-polling-plan.md for full documentation
 */

import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from '../api/helpers.js'

/** Cache entry for RSS ETag tracking */
export interface RssEtagCache {
  /** ETag from last successful check, null if API didn't return one */
  etag: string | null
  /** Timestamp of last check */
  lastCheck: number
}

/** Result of an RSS ETag check */
export interface RssEtagCheckResult {
  /** Whether the feed has changed since last check */
  changed: boolean
  /** Error message if check failed */
  error?: string
}

/**
 * RSS ETag-based change detector.
 *
 * Uses HEAD requests with If-None-Match to efficiently detect RSS feed changes
 * without downloading full payloads. When changes are detected, triggers the
 * existing ETag reconciliation flow.
 */
export class RssEtagPoller {
  /** ETag cache keyed by 'self' or 'friends' */
  private cache = new Map<string, RssEtagCache>()

  constructor(private readonly log: FastifyBaseLogger) {}

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Check RSS feed for changes using HEAD + If-None-Match.
   * Returns true if ETag changed (triggers reconciliation).
   *
   * No payload is ever fetched - this is pure change detection.
   *
   * @param rssUrl - The RSS feed URL to check
   * @param cacheKey - Cache key ('self' or 'friends')
   * @returns Result indicating if feed changed or error occurred
   */
  async checkForChanges(
    rssUrl: string,
    cacheKey: 'self' | 'friends',
  ): Promise<RssEtagCheckResult> {
    if (!rssUrl) {
      return { changed: false, error: 'No RSS URL provided' }
    }

    const cached = this.cache.get(cacheKey)

    try {
      // Build request headers
      const headers: Record<string, string> = {}
      // Only include If-None-Match if we have a valid ETag
      if (cached?.etag) {
        headers['If-None-Match'] = cached.etag
      }

      // Ensure we always use format=json for consistent ETags
      const url = new URL(rssUrl)
      if (!url.searchParams.has('format')) {
        url.searchParams.set('format', 'json')
      }

      const response = await fetch(url.toString(), {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      // 304 = no change
      if (response.status === 304) {
        this.log.debug({ cacheKey }, 'RSS feed unchanged (304)')
        // Update lastCheck timestamp
        if (cached) {
          this.cache.set(cacheKey, {
            ...cached,
            lastCheck: Date.now(),
          })
        }
        return { changed: false }
      }

      // Non-2xx response (except 304)
      if (!response.ok) {
        const error = `RSS HEAD request failed: ${response.status} ${response.statusText}`
        this.log.warn({ cacheKey, status: response.status }, error)
        return { changed: false, error }
      }

      // 200 = first request or content changed
      const newEtag = response.headers.get('etag')

      // Always update cache - even without ETag (prevents stale state)
      if (!newEtag) {
        this.log.warn({ cacheKey }, 'RSS response missing ETag header')
      }

      const previousEtag = cached?.etag
      this.cache.set(cacheKey, {
        etag: newEtag,
        lastCheck: Date.now(),
      })

      // First request (no previous ETag) - not a "change", just initialization
      if (!previousEtag) {
        this.log.debug(
          { cacheKey, etag: newEtag },
          'RSS ETag baseline established',
        )
        return { changed: false }
      }

      // ETag changed = content changed
      if (previousEtag !== newEtag) {
        this.log.info(
          { cacheKey, previousEtag, newEtag },
          'RSS feed changed (ETag mismatch)',
        )
        return { changed: true }
      }

      // ETag same but got 200 instead of 304 (shouldn't happen, but handle it)
      this.log.debug({ cacheKey }, 'RSS feed unchanged (ETag match)')
      return { changed: false }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      this.log.error(
        { error: errorMessage, cacheKey, rssUrl },
        'Error checking RSS feed for changes',
      )
      return { changed: false, error: errorMessage }
    }
  }

  /**
   * Clear the ETag cache for a specific key or all keys.
   *
   * @param cacheKey - Optional specific key to clear, or clear all if not provided
   */
  clearCache(cacheKey?: 'self' | 'friends'): void {
    if (cacheKey) {
      this.cache.delete(cacheKey)
      this.log.debug({ cacheKey }, 'RSS ETag cache cleared')
    } else {
      this.cache.clear()
      this.log.debug('All RSS ETag caches cleared')
    }
  }

  /**
   * Get the current cache state for debugging/monitoring.
   *
   * @returns Map of cache keys to their cached state
   */
  getCacheState(): Map<string, RssEtagCache> {
    return new Map(this.cache)
  }

  /**
   * Check if we have a cached ETag for a given key.
   *
   * @param cacheKey - The cache key to check
   * @returns True if we have a cached ETag
   */
  hasCache(cacheKey: 'self' | 'friends'): boolean {
    return this.cache.has(cacheKey)
  }
}
