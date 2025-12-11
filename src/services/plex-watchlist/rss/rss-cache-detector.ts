/**
 * RSS Cache Detector
 *
 * Detects CDN cache settings from Plex RSS feed headers to determine
 * if RSS mode will provide timely updates or if ETag mode should be used instead.
 *
 * Plex RSS feeds may have aggressive CDN caching (e.g., s-maxage=7200 for 2 hours)
 * which makes RSS polling ineffective for real-time change detection.
 */

import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from '../api/helpers.js'

/** Result of RSS cache detection */
export interface RssCacheInfo {
  /** CDN/proxy cache duration in seconds (s-maxage), null if not present */
  sMaxAge: number | null
  /** Browser cache duration in seconds (max-age), null if not present */
  maxAge: number | null
  /** Whether the cache duration exceeds the acceptable threshold */
  isCacheTooAggressive: boolean
  /** Human-readable description of the cache status */
  description: string
}

/**
 * Threshold in seconds above which RSS caching is considered too aggressive.
 * If s-maxage exceeds this, ETag mode should be preferred.
 * Default: 300 seconds (5 minutes) - matches ETag polling cycle time.
 */
const CACHE_THRESHOLD_SECONDS = 300

/**
 * Detect RSS feed cache settings by performing a HEAD request.
 *
 * Parses the Cache-Control header to extract:
 * - s-maxage: CDN/proxy cache duration (what affects our polling)
 * - max-age: Browser cache duration (less relevant for server-side polling)
 *
 * @param rssUrl - RSS feed URL to check
 * @param log - Logger instance
 * @returns Cache information including whether it's too aggressive
 */
export async function detectRssCacheSettings(
  rssUrl: string,
  log: FastifyBaseLogger,
): Promise<RssCacheInfo> {
  if (!rssUrl) {
    return {
      sMaxAge: null,
      maxAge: null,
      isCacheTooAggressive: false,
      description: 'No RSS URL provided',
    }
  }

  try {
    const response = await fetch(rssUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    if (!response.ok) {
      log.warn(
        { status: response.status, rssUrl },
        'Failed to fetch RSS headers for cache detection',
      )
      return {
        sMaxAge: null,
        maxAge: null,
        isCacheTooAggressive: false,
        description: `HTTP ${response.status} - unable to detect cache settings`,
      }
    }

    const cacheControl = response.headers.get('cache-control')

    if (!cacheControl) {
      log.debug({ rssUrl }, 'No Cache-Control header found on RSS feed')
      return {
        sMaxAge: null,
        maxAge: null,
        isCacheTooAggressive: false,
        description: 'No Cache-Control header present',
      }
    }

    // Parse cache-control directives
    const sMaxAge = parseCacheDirective(cacheControl, 's-maxage')
    const maxAge = parseCacheDirective(cacheControl, 'max-age')

    // s-maxage is what CDNs use, so that's our primary concern
    const effectiveCacheTime = sMaxAge ?? maxAge ?? 0
    const isCacheTooAggressive = effectiveCacheTime > CACHE_THRESHOLD_SECONDS

    const description = buildCacheDescription(
      sMaxAge,
      maxAge,
      isCacheTooAggressive,
    )

    log.debug(
      {
        rssUrl,
        cacheControl,
        sMaxAge,
        maxAge,
        isCacheTooAggressive,
        thresholdSeconds: CACHE_THRESHOLD_SECONDS,
      },
      'RSS cache settings detected',
    )

    return {
      sMaxAge,
      maxAge,
      isCacheTooAggressive,
      description,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error(
      { error: errorMessage, rssUrl },
      'Error detecting RSS cache settings',
    )
    return {
      sMaxAge: null,
      maxAge: null,
      isCacheTooAggressive: false,
      description: `Error: ${errorMessage}`,
    }
  }
}

/**
 * Parse a numeric directive from Cache-Control header.
 *
 * @param cacheControl - Full Cache-Control header value
 * @param directive - Directive name to parse (e.g., 's-maxage', 'max-age')
 * @returns Parsed value in seconds, or null if not found
 */
function parseCacheDirective(
  cacheControl: string,
  directive: string,
): number | null {
  // Match directive=value pattern, handling optional spaces
  const regex = new RegExp(`${directive}\\s*=\\s*(\\d+)`, 'i')
  const match = cacheControl.match(regex)

  if (match?.[1]) {
    const value = parseInt(match[1], 10)
    return Number.isNaN(value) ? null : value
  }

  return null
}

/**
 * Build a human-readable description of the cache status.
 */
function buildCacheDescription(
  sMaxAge: number | null,
  maxAge: number | null,
  isTooAggressive: boolean,
): string {
  const parts: string[] = []

  if (sMaxAge !== null) {
    const minutes = Math.round(sMaxAge / 60)
    parts.push(`CDN cache: ${minutes} min`)
  }

  if (maxAge !== null && maxAge !== sMaxAge) {
    const minutes = Math.round(maxAge / 60)
    parts.push(`browser cache: ${minutes} min`)
  }

  if (parts.length === 0) {
    return 'No cache directives found'
  }

  const cacheInfo = parts.join(', ')

  if (isTooAggressive) {
    return `${cacheInfo} (too aggressive for real-time detection)`
  }

  return `${cacheInfo} (acceptable for RSS mode)`
}

/**
 * Get the cache threshold in seconds.
 * Exported for testing and configuration reference.
 */
export function getCacheThresholdSeconds(): number {
  return CACHE_THRESHOLD_SECONDS
}
