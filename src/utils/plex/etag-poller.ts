/**
 * ETag-based Watchlist Polling
 *
 * Provides efficient watchlist change detection using ETag-based polling.
 * Used by the hybrid RSS + ETag approach to identify which specific user's
 * watchlist changed, enabling targeted sync instead of full reconciliation.
 *
 * Uses two different APIs:
 * - Direct API (discover.provider.plex.tv) for primary token user - supports true 304 responses
 * - GraphQL API (community.plex.tv/api) for friends - requires client-side ETag comparison
 *
 * @see fixes/rss-etag-hybrid-approach.md for full documentation
 */

import type { Config } from '@root/types/config.types.js'
import type {
  DiscoverWatchlistResponse,
  EtagPollItem,
  EtagPollResult,
  Friend,
  GraphQLWatchlistPollResponse,
  WatchlistEtagCache,
} from '@root/types/plex.types.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from './helpers.js'

/** User info needed for ETag polling */
export interface EtagUserInfo {
  userId: number
  username: string
  watchlistId?: string // Only for friends, not primary user
  isPrimary: boolean
}

/**
 * ETag-based watchlist change detector.
 *
 * Maintains a cache of ETags for each user's watchlist and provides methods
 * to check for changes and establish baselines after full syncs.
 */
export class EtagPoller {
  /** ETag cache keyed by 'primary:{userId}' or 'friend:{watchlistId}' */
  private cache = new Map<string, WatchlistEtagCache>()

  constructor(
    private readonly config: Config,
    private readonly log: FastifyBaseLogger,
  ) {}

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Establish ETag baseline for a single user.
   * Called after a new friend is added and synced.
   *
   * @param user - User info for establishing baseline
   */
  async establishBaseline(user: EtagUserInfo): Promise<void> {
    const token = this.config.plexTokens?.[0]
    if (!token) {
      this.log.warn('Cannot establish baseline: no Plex token configured')
      return
    }

    if (user.isPrimary) {
      await this.pollPrimary(token, user.userId, 20)
    } else if (user.watchlistId) {
      const friend: Friend = {
        watchlistId: user.watchlistId,
        username: user.username,
        userId: user.userId,
      }
      await this.pollFriend(token, friend, user.userId, 2)
    }

    this.log.debug(
      { userId: user.userId, username: user.username },
      'ETag baseline established',
    )
  }

  /**
   * Establish ETag baselines for all users.
   * Called after a full sync completes.
   *
   * @param primaryUserId - The primary user's ID
   * @param friends - Array of friend info with watchlistIds
   */
  async establishAllBaselines(
    primaryUserId: number,
    friends: EtagUserInfo[],
  ): Promise<void> {
    const token = this.config.plexTokens?.[0]
    if (!token) {
      this.log.warn('Cannot establish baselines: no Plex token configured')
      return
    }

    // Primary user: 20 items for baseline
    await this.pollPrimary(token, primaryUserId, 20)
    this.log.debug({ userId: primaryUserId }, 'Primary user ETag baseline established')

    // Friends: 2 items each for baseline (minimal query)
    for (const user of friends) {
      if (user.watchlistId) {
        const friend: Friend = {
          watchlistId: user.watchlistId,
          username: user.username,
          userId: user.userId,
        }
        await this.pollFriend(token, friend, user.userId, 2)
      }
    }

    this.log.info(
      { friendCount: friends.length },
      'ETag baselines established for all users',
    )
  }

  /**
   * Check all users' ETags against cached baselines.
   * Returns array of userIds whose watchlists have changed.
   *
   * @param primaryUserId - The primary user's ID
   * @param friends - Array of friend info with watchlistIds
   * @returns Array of userIds with changed watchlists
   */
  async checkAllEtags(
    primaryUserId: number,
    friends: EtagUserInfo[],
  ): Promise<number[]> {
    const token = this.config.plexTokens?.[0]
    if (!token) {
      this.log.warn('Cannot check ETags: no Plex token configured')
      return []
    }

    const changedUserIds: number[] = []

    // Check primary user
    const primaryResult = await this.pollPrimary(token, primaryUserId, 20)
    if (primaryResult.changed) {
      changedUserIds.push(primaryUserId)
    }

    // Check friends
    for (const user of friends) {
      if (user.watchlistId) {
        const friend: Friend = {
          watchlistId: user.watchlistId,
          username: user.username,
          userId: user.userId,
        }
        const result = await this.pollFriend(token, friend, user.userId, 20)
        if (result.changed) {
          changedUserIds.push(user.userId)
        }
      }
    }

    if (changedUserIds.length > 0) {
      this.log.info(
        { changedUserIds, count: changedUserIds.length },
        'ETag check detected changes',
      )
    } else {
      this.log.debug('ETag check: no changes detected')
    }

    return changedUserIds
  }

  /**
   * Remove a user from the ETag cache.
   * Called when a friend is removed.
   *
   * @param userId - The user ID to invalidate
   * @param watchlistId - Optional watchlist ID for friend cache key
   */
  invalidateUser(userId: number, watchlistId?: string): void {
    // Try both key formats
    const primaryKey = `primary:${userId}`
    const friendKey = watchlistId ? `friend:${watchlistId}` : null

    if (this.cache.has(primaryKey)) {
      this.cache.delete(primaryKey)
      this.log.debug({ userId }, 'Invalidated primary user ETag cache')
    }

    if (friendKey && this.cache.has(friendKey)) {
      this.cache.delete(friendKey)
      this.log.debug({ userId, watchlistId }, 'Invalidated friend ETag cache')
    }
  }

  /**
   * Clear the entire ETag cache.
   * Useful for debugging or forcing fresh baselines.
   */
  clearCache(): void {
    this.cache.clear()
    this.log.debug('ETag cache cleared')
  }

  /**
   * Get a copy of the current cache for debugging/status.
   */
  getCache(): Map<string, WatchlistEtagCache> {
    return new Map(this.cache)
  }

  // ============================================================================
  // Private Polling Methods
  // ============================================================================

  /**
   * Poll the primary token user's watchlist using the direct API.
   * Supports true HTTP 304 responses for efficient bandwidth usage.
   */
  private async pollPrimary(
    token: string,
    userId: number,
    itemCount: number,
  ): Promise<EtagPollResult> {
    const cacheKey = `primary:${userId}`
    const cached = this.cache.get(cacheKey)
    const isFirstPoll = !cached?.etag

    const url = new URL(
      'https://discover.provider.plex.tv/library/sections/watchlist/all',
    )
    url.searchParams.append('X-Plex-Container-Start', '0')
    url.searchParams.append('X-Plex-Container-Size', itemCount.toString())

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Plex-Token': token,
      }
      if (cached?.etag) {
        headers['If-None-Match'] = cached.etag
      }

      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      // Direct API supports true 304 responses
      if (response.status === 304) {
        return { changed: false, userId }
      }

      if (!response.ok) {
        const errorMsg = `Direct API error: ${response.status} ${response.statusText}`
        this.log.warn({ userId, status: response.status }, errorMsg)
        return { changed: false, userId, error: errorMsg }
      }

      // Get and compare ETag
      const newEtag = response.headers.get('etag')
      const previousEtag = cached?.etag

      // On first poll, just establish baseline - don't report as changed
      // The full sync has already processed all items
      if (isFirstPoll) {
        if (newEtag) {
          this.cache.set(cacheKey, { etag: newEtag, lastCheck: Date.now() })
        }
        return { changed: false, userId }
      }

      // If ETag hasn't changed, treat as no change (client-side comparison fallback)
      // This handles cases where Plex doesn't properly return 304
      if (newEtag && previousEtag && newEtag === previousEtag) {
        return { changed: false, userId }
      }

      // Update cached ETag
      if (newEtag) {
        this.cache.set(cacheKey, { etag: newEtag, lastCheck: Date.now() })
      }

      const data = (await response.json()) as DiscoverWatchlistResponse
      const metadata = data.MediaContainer?.Metadata ?? []

      const items: EtagPollItem[] = metadata
        .filter((m) => m.key || m.ratingKey)
        .map((m) => {
          const key = m.key
            ?.replace('/library/metadata/', '')
            .replace('/children', '')
          return {
            id: key ?? m.ratingKey ?? '',
            title: m.title ?? 'Unknown',
            type: m.type ?? 'unknown',
          }
        })

      this.log.debug(
        { userId, itemCount: items.length, etag: newEtag },
        'Primary watchlist changed',
      )

      return { changed: true, items, userId }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error polling primary'
      this.log.error({ error, userId }, 'Error polling primary watchlist')
      return { changed: false, userId, error: errorMsg }
    }
  }

  /**
   * Poll a friend's watchlist for changes using the GraphQL API.
   * GraphQL does not support 304 responses, so ETags are compared client-side.
   *
   * Uses a two-step process when ETag is cached:
   * 1. Tiny query (first: 2) to get current ETag
   * 2. If ETag changed, fetch full data (first: itemCount)
   *
   * On first poll (no cached ETag), just establishes baseline.
   */
  private async pollFriend(
    token: string,
    friend: Friend,
    userId: number,
    itemCount: number,
  ): Promise<EtagPollResult> {
    const cacheKey = `friend:${friend.watchlistId}`
    const cached = this.cache.get(cacheKey)
    const isFirstPoll = !cached?.etag

    try {
      // Always do the tiny query first to get/compare ETag
      // (GraphQL ETags differ based on query params, so we must be consistent)
      const checkResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plex-Token': token,
        },
        body: JSON.stringify({
          query: `query {
            userV2(user: {id: "${friend.watchlistId}"}) {
              ... on User {
                watchlist(first: 2) {
                  nodes { id }
                }
              }
            }
          }`,
        }),
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      if (!checkResponse.ok) {
        const errorMsg = `GraphQL check error: ${checkResponse.status} ${checkResponse.statusText}`
        this.log.warn(
          { userId, username: friend.username, status: checkResponse.status },
          errorMsg,
        )
        return { changed: false, userId, error: errorMsg }
      }

      const newEtag = checkResponse.headers.get('etag')

      // On first poll, just establish baseline - don't report as changed
      if (isFirstPoll) {
        if (newEtag) {
          this.cache.set(cacheKey, { etag: newEtag, lastCheck: Date.now() })
        }
        return { changed: false, userId }
      }

      // Compare ETags client-side
      if (newEtag && cached?.etag && newEtag === cached.etag) {
        return { changed: false, userId }
      }

      // ETag changed - update cache and fetch full data
      if (newEtag) {
        this.cache.set(cacheKey, { etag: newEtag, lastCheck: Date.now() })
      }

      // Fetch full data
      const fullResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plex-Token': token,
        },
        body: JSON.stringify({
          query: `query {
            userV2(user: {id: "${friend.watchlistId}"}) {
              ... on User {
                watchlist(first: ${itemCount}) {
                  nodes { id title type }
                }
              }
            }
          }`,
        }),
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      if (!fullResponse.ok) {
        const errorMsg = `GraphQL fetch error: ${fullResponse.status} ${fullResponse.statusText}`
        this.log.warn(
          { userId, username: friend.username, status: fullResponse.status },
          errorMsg,
        )
        return { changed: false, userId, error: errorMsg }
      }

      const data = (await fullResponse.json()) as GraphQLWatchlistPollResponse

      if (data.errors?.length) {
        const errorMsg = `GraphQL errors: ${data.errors.map((e) => e.message).join(', ')}`
        this.log.warn(
          { userId, username: friend.username, errors: data.errors },
          errorMsg,
        )
        return { changed: false, userId, error: errorMsg }
      }

      const nodes = data.data?.userV2?.watchlist?.nodes ?? []
      const items: EtagPollItem[] = nodes.map((node) => ({
        id: node.id,
        title: node.title,
        type: node.type,
      }))

      this.log.debug(
        {
          userId,
          username: friend.username,
          itemCount: items.length,
          etag: newEtag,
        },
        'Friend watchlist changed',
      )

      return { changed: true, items, userId }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Unknown error polling friend'
      this.log.error(
        { error, userId, username: friend.username },
        'Error polling friend watchlist',
      )
      return { changed: false, userId, error: errorMsg }
    }
  }
}
