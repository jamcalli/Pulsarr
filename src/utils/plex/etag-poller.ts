/**
 * ETag-based Watchlist Polling
 *
 * Provides efficient watchlist change detection using ETag-based polling.
 * Used by the hybrid RSS + ETag approach to identify which specific user's
 * watchlist changed, enabling targeted sync instead of full reconciliation.
 *
 * Two-Phase Caching Strategy:
 * - Phase 1 (Baseline): Fetch 20 items (for diffing), then 2-item query (for ETag)
 * - Phase 2 (Check): 2-item query to compare ETag, if changed fetch 20 items and diff
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
  EtagUserInfo,
  Friend,
  GraphQLWatchlistPollResponse,
  WatchlistEtagCache,
} from '@root/types/plex.types.js'
import type { FastifyBaseLogger } from 'fastify'
import { PLEX_API_TIMEOUT_MS } from './helpers.js'

// Re-export EtagUserInfo for convenience
export type { EtagUserInfo }

/**
 * ETag-based watchlist change detector.
 *
 * Maintains a cache of ETags AND items for each user's watchlist.
 * - ETag (from 2-item query): Used for change detection
 * - Items (20 items): Used for diffing to identify NEW items
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
   * Two-phase process:
   * 1. Fetch 20 items → cache for diffing
   * 2. Fetch 2 items → cache ETag for change detection
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
      await this.establishPrimaryBaseline(token, user.userId)
    } else if (user.watchlistId) {
      const friend: Friend = {
        watchlistId: user.watchlistId,
        username: user.username,
        userId: user.userId,
      }
      await this.establishFriendBaseline(token, friend, user.userId)
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

    // Primary user baseline
    await this.establishPrimaryBaseline(token, primaryUserId)
    this.log.debug({ userId: primaryUserId }, 'Primary user ETag baseline established')

    // Friends baselines
    for (const user of friends) {
      if (user.watchlistId) {
        const friend: Friend = {
          watchlistId: user.watchlistId,
          username: user.username,
          userId: user.userId,
        }
        await this.establishFriendBaseline(token, friend, user.userId)
      }
    }

    this.log.info(
      { friendCount: friends.length },
      'ETag baselines established for all users',
    )
  }

  /**
   * Check all users' ETags against cached baselines.
   * Returns array of results with newItems for each changed user.
   *
   * @param primaryUserId - The primary user's ID
   * @param friends - Array of friend info with watchlistIds
   * @returns Array of poll results (only includes users with changes or errors)
   */
  async checkAllEtags(
    primaryUserId: number,
    friends: EtagUserInfo[],
  ): Promise<EtagPollResult[]> {
    const token = this.config.plexTokens?.[0]
    if (!token) {
      this.log.warn('Cannot check ETags: no Plex token configured')
      return []
    }

    const results: EtagPollResult[] = []

    // Check primary user
    const primaryResult = await this.checkPrimary(token, primaryUserId)
    if (primaryResult.changed || primaryResult.error) {
      results.push(primaryResult)
    }

    // Check friends
    for (const user of friends) {
      if (user.watchlistId) {
        const friend: Friend = {
          watchlistId: user.watchlistId,
          username: user.username,
          userId: user.userId,
        }
        const result = await this.checkFriend(token, friend, user.userId)
        if (result.changed || result.error) {
          results.push(result)
        }
      }
    }

    if (results.length > 0) {
      const changedCount = results.filter((r) => r.changed).length
      const errorCount = results.filter((r) => r.error).length
      this.log.info(
        { changedCount, errorCount, totalChecked: 1 + friends.length },
        'ETag check completed',
      )
    } else {
      this.log.debug('ETag check: no changes detected')
    }

    return results
  }

  /**
   * Get cached items for a user (used for new friend initial routing).
   *
   * @param user - User info
   * @returns Cached items or empty array
   */
  getCachedItems(user: EtagUserInfo): EtagPollItem[] {
    const cacheKey = user.isPrimary
      ? `primary:${user.userId}`
      : `friend:${user.watchlistId}`
    return this.cache.get(cacheKey)?.items ?? []
  }

  /**
   * Remove a user from the ETag cache.
   * Called when a friend is removed.
   *
   * @param userId - The user ID to invalidate
   * @param watchlistId - Optional watchlist ID for friend cache key
   */
  invalidateUser(userId: number, watchlistId?: string): void {
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
  // Private: Baseline Establishment (Two-Phase)
  // ============================================================================

  /**
   * Establish baseline for primary user.
   * Phase 1: Fetch 20 items for diffing cache
   * Phase 2: Primary API supports 304, so we use the 20-item ETag directly
   */
  private async establishPrimaryBaseline(
    token: string,
    userId: number,
  ): Promise<void> {
    const cacheKey = `primary:${userId}`

    // Fetch 20 items - the ETag from this response is what we'll use
    const url = new URL(
      'https://discover.provider.plex.tv/library/sections/watchlist/all',
    )
    url.searchParams.append('X-Plex-Container-Start', '0')
    url.searchParams.append('X-Plex-Container-Size', '20')

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': token,
        },
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      if (!response.ok) {
        this.log.warn(
          { userId, status: response.status },
          'Failed to establish primary baseline',
        )
        return
      }

      const etag = response.headers.get('etag')
      const data = (await response.json()) as DiscoverWatchlistResponse
      const items = this.parseDiscoverItems(data)

      if (etag) {
        this.cache.set(cacheKey, {
          etag,
          lastCheck: Date.now(),
          items,
        })
      }
    } catch (error) {
      this.log.error({ error, userId }, 'Error establishing primary baseline')
    }
  }

  /**
   * Establish baseline for a friend.
   * Phase 1: Fetch 20 items for diffing cache
   * Phase 2: Fetch 2 items to get the ETag we'll use for comparison
   *
   * GraphQL ETags depend on query params, so we must use consistent query size
   */
  private async establishFriendBaseline(
    token: string,
    friend: Friend,
    userId: number,
  ): Promise<void> {
    const cacheKey = `friend:${friend.watchlistId}`

    try {
      // Phase 1: Fetch 20 items for diffing cache
      const itemsResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plex-Token': token,
        },
        body: JSON.stringify({
          query: `query {
            userV2(user: {id: "${friend.watchlistId}"}) {
              ... on User {
                watchlist(first: 20) {
                  nodes { id title type }
                }
              }
            }
          }`,
        }),
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      if (!itemsResponse.ok) {
        this.log.warn(
          { userId, username: friend.username, status: itemsResponse.status },
          'Failed to fetch items for friend baseline',
        )
        return
      }

      const itemsData = (await itemsResponse.json()) as GraphQLWatchlistPollResponse
      const items = this.parseGraphQLItems(itemsData)

      // Phase 2: Fetch 2 items to get the ETag for change detection
      const etagResponse = await fetch('https://community.plex.tv/api', {
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

      if (!etagResponse.ok) {
        this.log.warn(
          { userId, username: friend.username, status: etagResponse.status },
          'Failed to get ETag for friend baseline',
        )
        return
      }

      const etag = etagResponse.headers.get('etag')

      if (etag) {
        this.cache.set(cacheKey, {
          etag,
          lastCheck: Date.now(),
          items,
        })
      }
    } catch (error) {
      this.log.error(
        { error, userId, username: friend.username },
        'Error establishing friend baseline',
      )
    }
  }

  // ============================================================================
  // Private: Change Detection with Item Diffing
  // ============================================================================

  /**
   * Check primary user for changes.
   * Uses If-None-Match for efficient 304 responses.
   * If changed, diffs items to find new ones.
   */
  private async checkPrimary(
    token: string,
    userId: number,
  ): Promise<EtagPollResult> {
    const cacheKey = `primary:${userId}`
    const cached = this.cache.get(cacheKey)

    if (!cached) {
      // No baseline - need to establish first
      await this.establishPrimaryBaseline(token, userId)
      return { changed: false, userId, newItems: [] }
    }

    const url = new URL(
      'https://discover.provider.plex.tv/library/sections/watchlist/all',
    )
    url.searchParams.append('X-Plex-Container-Start', '0')
    url.searchParams.append('X-Plex-Container-Size', '20')

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': token,
          'If-None-Match': cached.etag,
        },
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      // 304 = no change
      if (response.status === 304) {
        return { changed: false, userId, newItems: [] }
      }

      if (!response.ok) {
        const errorMsg = `Primary API error: ${response.status}`
        this.log.warn({ userId, status: response.status }, errorMsg)
        return { changed: false, userId, newItems: [], error: errorMsg }
      }

      const newEtag = response.headers.get('etag')
      const data = (await response.json()) as DiscoverWatchlistResponse
      const freshItems = this.parseDiscoverItems(data)

      // Diff to find new items
      const newItems = this.diffItems(freshItems, cached.items)

      // Update cache
      if (newEtag) {
        this.cache.set(cacheKey, {
          etag: newEtag,
          lastCheck: Date.now(),
          items: freshItems,
        })
      }

      if (newItems.length > 0) {
        this.log.debug(
          { userId, newItemCount: newItems.length },
          'Primary watchlist has new items',
        )
      }

      return { changed: newItems.length > 0, userId, newItems }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.log.error({ error, userId }, 'Error checking primary watchlist')
      return { changed: false, userId, newItems: [], error: errorMsg }
    }
  }

  /**
   * Check friend for changes.
   * Phase 1: 2-item query to compare ETag
   * Phase 2: If ETag changed, fetch 20 items and diff
   */
  private async checkFriend(
    token: string,
    friend: Friend,
    userId: number,
  ): Promise<EtagPollResult> {
    const cacheKey = `friend:${friend.watchlistId}`
    const cached = this.cache.get(cacheKey)

    if (!cached) {
      // No baseline - need to establish first
      await this.establishFriendBaseline(token, friend, userId)
      return { changed: false, userId, newItems: [] }
    }

    try {
      // Phase 1: 2-item query to check ETag
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
        const errorMsg = `GraphQL check error: ${checkResponse.status}`
        this.log.warn({ userId, username: friend.username, status: checkResponse.status }, errorMsg)
        return { changed: false, userId, newItems: [], error: errorMsg }
      }

      const newEtag = checkResponse.headers.get('etag')

      // Compare ETags - if same, no change
      if (newEtag && newEtag === cached.etag) {
        return { changed: false, userId, newItems: [] }
      }

      // Phase 2: ETag changed - fetch 20 items for diffing
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
                watchlist(first: 20) {
                  nodes { id title type }
                }
              }
            }
          }`,
        }),
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      if (!fullResponse.ok) {
        const errorMsg = `GraphQL fetch error: ${fullResponse.status}`
        this.log.warn({ userId, username: friend.username, status: fullResponse.status }, errorMsg)
        return { changed: false, userId, newItems: [], error: errorMsg }
      }

      const data = (await fullResponse.json()) as GraphQLWatchlistPollResponse

      if (data.errors?.length) {
        const errorMsg = `GraphQL errors: ${data.errors.map((e) => e.message).join(', ')}`
        this.log.warn({ userId, username: friend.username, errors: data.errors }, errorMsg)
        return { changed: false, userId, newItems: [], error: errorMsg }
      }

      const freshItems = this.parseGraphQLItems(data)

      // Diff to find new items
      const newItems = this.diffItems(freshItems, cached.items)

      // Update cache with fresh items and new ETag
      if (newEtag) {
        this.cache.set(cacheKey, {
          etag: newEtag,
          lastCheck: Date.now(),
          items: freshItems,
        })
      }

      if (newItems.length > 0) {
        this.log.debug(
          { userId, username: friend.username, newItemCount: newItems.length },
          'Friend watchlist has new items',
        )
      }

      return { changed: newItems.length > 0, userId, newItems }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.log.error({ error, userId, username: friend.username }, 'Error checking friend watchlist')
      return { changed: false, userId, newItems: [], error: errorMsg }
    }
  }

  // ============================================================================
  // Private: Utility Methods
  // ============================================================================

  /**
   * Parse items from Discover API response
   */
  private parseDiscoverItems(data: DiscoverWatchlistResponse): EtagPollItem[] {
    const metadata = data.MediaContainer?.Metadata ?? []
    return metadata
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
  }

  /**
   * Parse items from GraphQL response
   */
  private parseGraphQLItems(data: GraphQLWatchlistPollResponse): EtagPollItem[] {
    const nodes = data.data?.userV2?.watchlist?.nodes ?? []
    return nodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
    }))
  }

  /**
   * Diff fresh items against cached items to find NEW items.
   * Returns items that are in fresh but not in cached.
   */
  private diffItems(
    freshItems: EtagPollItem[],
    cachedItems: EtagPollItem[],
  ): EtagPollItem[] {
    const cachedIds = new Set(cachedItems.map((item) => item.id))
    return freshItems.filter((item) => !cachedIds.has(item.id))
  }
}
