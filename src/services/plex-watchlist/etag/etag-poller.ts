/**
 * ETag-based Watchlist Polling
 *
 * Provides efficient watchlist change detection using ETag-based polling.
 * Used by the hybrid RSS + ETag approach to identify which specific user's
 * watchlist changed, enabling targeted sync instead of full reconciliation.
 *
 * Two different strategies based on API capabilities:
 *
 * Primary User (Discover API - supports true 304):
 * - Single 50-item request with If-None-Match header
 * - Server returns 304 if unchanged, avoiding response body
 * - If changed, diff items against cache to find new ones
 *
 * Friends (GraphQL API - no 304 support):
 * - Baseline: Fetch 50 items (for diffing), then 2-item query (for ETag)
 * - Check: 2-item query to compare ETag, if changed fetch 50 items and diff
 * - 2-item query is cheapest possible GraphQL call for change detection
 *
 * Staggered Polling (Non-RSS Mode):
 * - ~5-minute cycle time (faster for small user counts due to buffer)
 * - Users polled sequentially with even distribution
 * - ±10% jitter to prevent synchronization drift
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
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { PLEX_API_TIMEOUT_MS } from '../api/helpers.js'

/** Number of items to cache for diffing (increased for 5-min polling interval) */
const ETAG_CACHE_SIZE = 50

/** Total cycle time for staggered polling (5 minutes) */
const STAGGERED_CYCLE_MS = 5 * 60 * 1000

/** Jitter percentage for staggered polling (±10%) */
const STAGGERED_JITTER_PERCENT = 0.1

/**
 * ETag-based watchlist change detector.
 *
 * Maintains a cache of ETags AND items for each user's watchlist.
 * - ETag (from 2-item query): Used for change detection
 * - Items (50 items): Used for diffing to identify NEW items
 */
export class EtagPoller {
  /** ETag cache keyed by 'primary:{userId}' or 'friend:{watchlistId}' */
  private cache = new Map<string, WatchlistEtagCache>()

  /** Timer for staggered polling */
  private staggeredTimer: NodeJS.Timeout | null = null

  /** Whether staggered polling is active */
  private isStaggeredPollingActive = false

  /** Primary user for staggered polling (stored separately for robustness) */
  private staggeredPrimaryUser: EtagUserInfo | null = null

  /** Current user queue for staggered polling (primary + friends) */
  private staggeredUserQueue: EtagUserInfo[] = []

  /** Current index in staggered polling queue */
  private staggeredCurrentIndex = 0

  /** Callback for when a user's watchlist changes */
  private onUserChangedCallback:
    | ((result: EtagPollResult) => Promise<void>)
    | null = null

  /** Callback for when a new polling cycle starts (for friend refresh) */
  private onCycleStartCallback: (() => Promise<EtagUserInfo[]>) | null = null

  constructor(
    private readonly config: Config,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Establish ETag baseline for a single user.
   * Called after a new friend is added and synced.
   *
   * Two-phase process:
   * 1. Fetch 50 items → cache for diffing
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
      'Watchlist baseline established',
    )
  }

  /**
   * Establish baselines for all users.
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
    this.log.debug(
      { userId: primaryUserId },
      'Primary user watchlist baseline established',
    )

    // Friends baselines (bounded concurrency to respect Plex API limits)
    const limit = pLimit(2)
    const friendsWithWatchlist = friends.filter(
      (user): user is EtagUserInfo & { watchlistId: string } =>
        typeof user.watchlistId === 'string',
    )
    await Promise.all(
      friendsWithWatchlist.map((user) =>
        limit(async () => {
          const friend: Friend = {
            watchlistId: user.watchlistId,
            username: user.username,
            userId: user.userId,
          }
          await this.establishFriendBaseline(token, friend, user.userId)
        }),
      ),
    )

    this.log.info(
      { friendCount: friends.length },
      'Watchlist baselines established for all users',
    )
  }

  /**
   * Check all users for watchlist changes.
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
      this.log.warn('Cannot check watchlists: no Plex token configured')
      return []
    }

    const results: EtagPollResult[] = []

    // Check primary user
    const primaryResult = await this.checkPrimary(token, primaryUserId)
    if (primaryResult.changed || primaryResult.error) {
      results.push(primaryResult)
    }

    // Check friends (bounded concurrency to respect Plex API limits)
    const limit = pLimit(2)
    const friendsWithWatchlist = friends.filter(
      (user): user is EtagUserInfo & { watchlistId: string } =>
        typeof user.watchlistId === 'string',
    )
    const friendResults = await Promise.all(
      friendsWithWatchlist.map((user) =>
        limit(async () => {
          const friend: Friend = {
            watchlistId: user.watchlistId,
            username: user.username,
            userId: user.userId,
          }
          return this.checkFriend(token, friend, user.userId)
        }),
      ),
    )

    for (const result of friendResults) {
      if (result.changed || result.error) {
        results.push(result)
      }
    }

    const changedCount = results.filter((r) => r.changed).length
    const errorCount = results.filter((r) => r.error).length
    this.log.debug(
      { changedCount, errorCount, totalChecked: 1 + friends.length },
      'Watchlist change check completed',
    )

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
   * Remove a user from the watchlist cache.
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
      this.log.debug({ userId }, 'Cleared primary user watchlist cache')
    }

    if (friendKey && this.cache.has(friendKey)) {
      this.cache.delete(friendKey)
      this.log.debug({ userId, watchlistId }, 'Cleared friend watchlist cache')
    }
  }

  /**
   * Clear the entire watchlist cache.
   */
  clearCache(): void {
    this.cache.clear()
    this.log.debug('Watchlist cache cleared')
  }

  /**
   * Get a copy of the current cache for debugging/status.
   */
  getCache(): Map<string, WatchlistEtagCache> {
    return new Map(this.cache)
  }

  /**
   * Start staggered polling for non-RSS mode.
   * Polls users sequentially with even distribution across 5-minute cycles.
   *
   * @param primaryUserId - The primary user's ID
   * @param friends - Initial list of friends to poll
   * @param onUserChanged - Callback when a user's watchlist has new items
   * @param onCycleStart - Callback at start of each cycle to refresh friend list
   */
  startStaggeredPolling(
    primaryUserId: number,
    friends: EtagUserInfo[],
    onUserChanged: (result: EtagPollResult) => Promise<void>,
    onCycleStart: () => Promise<EtagUserInfo[]>,
  ): void {
    if (this.isStaggeredPollingActive) {
      this.log.warn('Staggered polling already active')
      return
    }

    this.isStaggeredPollingActive = true
    this.onUserChangedCallback = onUserChanged
    this.onCycleStartCallback = onCycleStart

    // Store primary user separately for robustness during queue rebuilds
    this.staggeredPrimaryUser = {
      userId: primaryUserId,
      username: 'Primary',
      isPrimary: true,
    }

    // Build initial user queue: primary user first, then friends
    this.staggeredUserQueue = [this.staggeredPrimaryUser, ...friends]
    this.staggeredCurrentIndex = 0

    this.log.info(
      { userCount: this.staggeredUserQueue.length },
      'Starting staggered ETag polling (5-minute cycles)',
    )

    // Start the first cycle immediately
    this.startNextCycle()
  }

  /**
   * Stop staggered polling.
   */
  stopStaggeredPolling(): void {
    if (this.staggeredTimer) {
      clearTimeout(this.staggeredTimer)
      this.staggeredTimer = null
    }

    this.isStaggeredPollingActive = false
    this.staggeredPrimaryUser = null
    this.staggeredUserQueue = []
    this.staggeredCurrentIndex = 0
    this.onUserChangedCallback = null
    this.onCycleStartCallback = null

    this.log.debug('Staggered polling stopped')
  }

  /**
   * Check if staggered polling is active.
   */
  isStaggeredPolling(): boolean {
    return this.isStaggeredPollingActive
  }

  /**
   * Check a single user for watchlist changes.
   * Used by staggered polling and can be called directly.
   *
   * @param user - User info to check
   * @returns Poll result with any new items
   */
  async checkUser(user: EtagUserInfo): Promise<EtagPollResult> {
    const token = this.config.plexTokens?.[0]
    if (!token) {
      return {
        changed: false,
        userId: user.userId,
        isPrimary: user.isPrimary,
        newItems: [],
        error: 'No Plex token configured',
      }
    }

    if (user.isPrimary) {
      return this.checkPrimary(token, user.userId)
    }

    if (!user.watchlistId) {
      return {
        changed: false,
        userId: user.userId,
        isPrimary: false,
        newItems: [],
        error: 'Friend missing watchlistId',
      }
    }

    const friend: Friend = {
      watchlistId: user.watchlistId,
      username: user.username,
      userId: user.userId,
    }
    return this.checkFriend(token, friend, user.userId)
  }

  /**
   * Start a new polling cycle.
   * Refreshes friend list, rebalances timing, then begins sequential polling.
   */
  private async startNextCycle(): Promise<void> {
    if (!this.isStaggeredPollingActive) return

    // Refresh friend list at cycle start
    if (this.onCycleStartCallback) {
      try {
        const updatedFriends = await this.onCycleStartCallback()

        // Use stored primary user (more robust than searching queue)
        if (this.staggeredPrimaryUser) {
          this.staggeredUserQueue = [
            this.staggeredPrimaryUser,
            ...updatedFriends,
          ]
        } else {
          this.staggeredUserQueue = updatedFriends
        }

        this.log.debug(
          { userCount: this.staggeredUserQueue.length },
          'Staggered polling cycle started with refreshed friend list',
        )
      } catch (error) {
        this.log.error({ error }, 'Failed to refresh friends at cycle start')
      }
    }

    // Reset to first user
    this.staggeredCurrentIndex = 0

    // Schedule first user check
    this.scheduleNextUserCheck()
  }

  /**
   * Schedule the next user check with calculated interval and jitter.
   */
  private scheduleNextUserCheck(): void {
    if (!this.isStaggeredPollingActive) return

    const userCount = this.staggeredUserQueue.length
    if (userCount === 0) {
      // No users, just wait for next cycle
      this.staggeredTimer = setTimeout(
        () => this.startNextCycle(),
        STAGGERED_CYCLE_MS,
      )
      return
    }

    // Calculate base interval: divide cycle time by (users + 1) to include buffer before next cycle
    // For small user counts this results in faster cycles (e.g., 1 user = ~2.5 min cycles)
    const baseInterval = STAGGERED_CYCLE_MS / (userCount + 1)

    // Apply jitter: ±10%
    const jitterRange = baseInterval * STAGGERED_JITTER_PERCENT
    const jitter = (Math.random() * 2 - 1) * jitterRange
    const interval = Math.max(1000, baseInterval + jitter) // Minimum 1 second

    this.staggeredTimer = setTimeout(() => this.pollNextUser(), interval)
  }

  /**
   * Poll the next user in the queue.
   */
  private async pollNextUser(): Promise<void> {
    if (!this.isStaggeredPollingActive) return

    const user = this.staggeredUserQueue[this.staggeredCurrentIndex]

    if (user) {
      try {
        const result = await this.checkUser(user)

        // Notify callback if there are changes
        if (result.changed && result.newItems.length > 0) {
          if (this.onUserChangedCallback) {
            await this.onUserChangedCallback(result)
          }
        }
      } catch (error) {
        this.log.error(
          { error, userId: user.userId, username: user.username },
          'Error during staggered poll',
        )
      }

      this.staggeredCurrentIndex++
    }

    // Check if cycle is complete
    if (this.staggeredCurrentIndex >= this.staggeredUserQueue.length) {
      // Cycle complete, start next cycle
      this.startNextCycle().catch((error) => {
        this.log.error({ error }, 'Error starting next polling cycle')
      })
    } else {
      // More users to check, schedule next
      this.scheduleNextUserCheck()
    }
  }

  /**
   * Establish baseline for primary user.
   * Phase 1: Fetch items for diffing cache
   * Phase 2: Primary API supports 304, so we use the cached ETag directly
   */
  private async establishPrimaryBaseline(
    token: string,
    userId: number,
  ): Promise<void> {
    const cacheKey = `primary:${userId}`

    // Fetch 50 items - the ETag from this response is what we'll use
    const url = new URL(
      'https://discover.provider.plex.tv/library/sections/watchlist/all',
    )
    url.searchParams.append('X-Plex-Container-Start', '0')
    url.searchParams.append('X-Plex-Container-Size', String(ETAG_CACHE_SIZE))

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
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

      if (!etag) {
        this.log.warn(
          { userId },
          'Primary baseline response missing ETag header - caching items without ETag',
        )
      }
      this.cache.set(cacheKey, {
        etag,
        lastCheck: Date.now(),
        items,
      })
    } catch (error) {
      this.log.error({ error, userId }, 'Error establishing primary baseline')
    }
  }

  /**
   * Establish baseline for a friend.
   * Phase 1: Fetch 50 items for diffing cache
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
      // Phase 1: Fetch 50 items for diffing cache
      const itemsResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          'X-Plex-Token': token,
        },
        body: JSON.stringify({
          query: `query {
            userV2(user: {id: "${friend.watchlistId}"}) {
              ... on User {
                watchlist(first: ${ETAG_CACHE_SIZE}) {
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

      const itemsData =
        (await itemsResponse.json()) as GraphQLWatchlistPollResponse

      // Check for GraphQL errors (consistent with checkFriend)
      if (itemsData.errors?.length) {
        this.log.warn(
          { userId, username: friend.username, errors: itemsData.errors },
          `GraphQL errors while fetching items for friend baseline: ${itemsData.errors.map((e) => e.message).join(', ')}`,
        )
        return
      }

      const items = this.parseGraphQLItems(itemsData)

      // Phase 2: Fetch 2 items to get the ETag for change detection
      const etagResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
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
          'Failed to establish friend watchlist baseline',
        )
        return
      }

      const etag = etagResponse.headers.get('etag')

      if (!etag) {
        this.log.warn(
          { userId, username: friend.username },
          'Friend baseline response missing ETag header - caching items without ETag',
        )
      }
      this.cache.set(cacheKey, {
        etag,
        lastCheck: Date.now(),
        items,
      })
    } catch (error) {
      this.log.error(
        { error, userId, username: friend.username },
        'Error establishing friend baseline',
      )
    }
  }

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
      return { changed: false, userId, isPrimary: true, newItems: [] }
    }

    const url = new URL(
      'https://discover.provider.plex.tv/library/sections/watchlist/all',
    )
    url.searchParams.append('X-Plex-Container-Start', '0')
    url.searchParams.append('X-Plex-Container-Size', String(ETAG_CACHE_SIZE))

    try {
      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Plex-Token': token,
      }
      // Only include If-None-Match if we have a valid ETag
      if (cached.etag) {
        headers['If-None-Match'] = cached.etag
      }

      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

      // 304 = no change
      if (response.status === 304) {
        return { changed: false, userId, isPrimary: true, newItems: [] }
      }

      if (!response.ok) {
        const errorMsg = `Primary API error: ${response.status}`
        this.log.warn({ userId, status: response.status }, errorMsg)
        return {
          changed: false,
          userId,
          isPrimary: true,
          newItems: [],
          error: errorMsg,
        }
      }

      const newEtag = response.headers.get('etag')
      const data = (await response.json()) as DiscoverWatchlistResponse
      const freshItems = this.parseDiscoverItems(data)

      // Diff to find new items
      const newItems = this.diffItems(freshItems, cached.items)

      // Update cache - always update items/timestamp even if ETag is missing
      if (!newEtag) {
        this.log.warn(
          { userId },
          'Primary API response missing ETag header - caching items without ETag',
        )
      }
      this.cache.set(cacheKey, {
        etag: newEtag,
        lastCheck: Date.now(),
        items: freshItems,
      })

      if (newItems.length > 0) {
        this.log.debug(
          { userId, newItemCount: newItems.length },
          'Primary watchlist has new items',
        )
      }

      return { changed: newItems.length > 0, userId, isPrimary: true, newItems }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.log.error({ error, userId }, 'Error checking primary watchlist')
      return {
        changed: false,
        userId,
        isPrimary: true,
        newItems: [],
        error: errorMsg,
      }
    }
  }

  /**
   * Check friend for changes.
   * Phase 1: 2-item query to compare ETag
   * Phase 2: If ETag changed, fetch 50 items and diff
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
      return { changed: false, userId, isPrimary: false, newItems: [] }
    }

    try {
      // Phase 1: 2-item query to check ETag
      const checkResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
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
        this.log.warn(
          { userId, username: friend.username, status: checkResponse.status },
          errorMsg,
        )
        return {
          changed: false,
          userId,
          isPrimary: false,
          newItems: [],
          error: errorMsg,
        }
      }

      const newEtag = checkResponse.headers.get('etag')

      // Compare ETags - if same, no change
      if (newEtag && newEtag === cached.etag) {
        return { changed: false, userId, isPrimary: false, newItems: [] }
      }

      // Phase 2: ETag changed - fetch 50 items for diffing
      const fullResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          'X-Plex-Token': token,
        },
        body: JSON.stringify({
          query: `query {
            userV2(user: {id: "${friend.watchlistId}"}) {
              ... on User {
                watchlist(first: ${ETAG_CACHE_SIZE}) {
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
        this.log.warn(
          { userId, username: friend.username, status: fullResponse.status },
          errorMsg,
        )
        return {
          changed: false,
          userId,
          isPrimary: false,
          newItems: [],
          error: errorMsg,
        }
      }

      const data = (await fullResponse.json()) as GraphQLWatchlistPollResponse

      if (data.errors?.length) {
        const errorMsg = `GraphQL errors: ${data.errors.map((e) => e.message).join(', ')}`
        this.log.warn(
          { userId, username: friend.username, errors: data.errors },
          errorMsg,
        )
        return {
          changed: false,
          userId,
          isPrimary: false,
          newItems: [],
          error: errorMsg,
        }
      }

      const freshItems = this.parseGraphQLItems(data)

      // Diff to find new items
      const newItems = this.diffItems(freshItems, cached.items)

      // Update cache - always update items/timestamp even if ETag is missing
      if (!newEtag) {
        this.log.warn(
          { userId, username: friend.username },
          'GraphQL API response missing ETag header - caching items without ETag',
        )
      }
      this.cache.set(cacheKey, {
        etag: newEtag,
        lastCheck: Date.now(),
        items: freshItems,
      })

      if (newItems.length > 0) {
        this.log.debug(
          { userId, username: friend.username, newItemCount: newItems.length },
          'Friend watchlist has new items',
        )
      }

      return {
        changed: newItems.length > 0,
        userId,
        isPrimary: false,
        newItems,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.log.error(
        { error, userId, username: friend.username },
        'Error checking friend watchlist',
      )
      return {
        changed: false,
        userId,
        isPrimary: false,
        newItems: [],
        error: errorMsg,
      }
    }
  }

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
  private parseGraphQLItems(
    data: GraphQLWatchlistPollResponse,
  ): EtagPollItem[] {
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
