import {
  fetchWatchlistNodes,
  getWatchlist,
} from '@services/plex-watchlist/api/graphql.js'
import { abortableDelay } from '@services/plex-watchlist/api/helpers.js'
import type { FastifyBaseLogger } from 'fastify'
import { type LiveWatchlistItem, normalizeWatchlistKey } from './diff.js'

/** Both Plex watchlist endpoints serve 100 items per page. */
export const DIAGNOSTICS_PAGE_SIZE = 100

/** Hard cap on pages per diagnostic run: 10 pages is 1,000 items. */
export const DIAGNOSTICS_MAX_PAGES = 10

export interface LiveWatchlistResult {
  items: LiveWatchlistItem[]
  truncated: boolean
  source: 'self' | 'friend'
}

export interface FetchLiveWatchlistOptions {
  /** Plex tokens in config order; the first one owns the self watchlist */
  tokens: string[]
  isPrimary: boolean
  /** The user's Plex UUID, required for a friend's watchlist */
  plexUuid: string | null
  username: string
  log: FastifyBaseLogger
  signal?: AbortSignal
  maxPages?: number
}

/**
 * Reads one user's live Plex watchlist with the same endpoints, page size and
 * inter-page jitter as the sync, but capped and without the DB fallback the
 * sync uses, so a failed fetch is reported instead of silently replaced.
 */
export async function fetchLiveWatchlist(
  options: FetchLiveWatchlistOptions,
): Promise<LiveWatchlistResult> {
  const maxPages = options.maxPages ?? DIAGNOSTICS_MAX_PAGES

  if (options.isPrimary) {
    const token = options.tokens[0]
    if (!token) throw new Error('No Plex token configured')
    return fetchSelfWatchlistCapped(
      token,
      options.log,
      maxPages,
      options.signal,
    )
  }

  if (!options.plexUuid) {
    throw new Error('User has no Plex UUID')
  }

  // A friend is visible to whichever configured token they are friends with,
  // so try each in turn; with one token this is a single attempt
  let lastError: unknown = new Error('No Plex token configured')
  for (const token of options.tokens) {
    if (!token) continue
    options.signal?.throwIfAborted()
    try {
      const { nodes, truncated } = await fetchWatchlistNodes({
        token,
        log: options.log,
        watchlistId: options.plexUuid,
        username: options.username,
        maxPages,
        signal: options.signal,
      })
      return {
        items: nodes.map((node) => ({
          key: normalizeWatchlistKey(String(node.id)),
          title: node.title || 'Unknown Title',
          type: (node.type || 'unknown').toLowerCase(),
        })),
        truncated,
        source: 'friend',
      }
    } catch (error) {
      options.signal?.throwIfAborted()
      lastError = error
    }
  }
  throw lastError
}

async function fetchSelfWatchlistCapped(
  token: string,
  log: FastifyBaseLogger,
  maxPages: number,
  signal: AbortSignal | undefined,
): Promise<LiveWatchlistResult> {
  const items: LiveWatchlistItem[] = []
  let start = 0

  for (let page = 0; page < maxPages; page++) {
    signal?.throwIfAborted()
    const response = await getWatchlist(token, log, start)
    signal?.throwIfAborted()

    const metadata = response?.MediaContainer?.Metadata ?? []
    const totalSize = response?.MediaContainer?.totalSize ?? 0

    for (const entry of metadata) {
      if (!entry.key) continue
      items.push({
        key: normalizeWatchlistKey(entry.key),
        title: entry.title || 'Unknown Title',
        type: (entry.type || 'unknown').toLowerCase(),
      })
    }

    start += metadata.length
    if (metadata.length === 0 || totalSize <= start) {
      return { items, truncated: false, source: 'self' }
    }

    if (page + 1 < maxPages) {
      // Delay between pagination requests per Plex developer request
      await abortableDelay(5_000 + Math.ceil(Math.random() * 10_000), signal)
    }
  }

  return { items, truncated: true, source: 'self' }
}
