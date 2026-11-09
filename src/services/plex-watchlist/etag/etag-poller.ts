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
import { errorMessage } from '@utils/error-message.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import {
  communityHeaders,
  discoverHeaders,
  discoverItemKey,
  PLEX_API_TIMEOUT_MS,
} from '../api/helpers.js'

const ETAG_CACHE_SIZE = 50

const friendItemsQuery = (watchlistId: string) => `query {
  userV2(user: {id: "${watchlistId}"}) {
    ... on User {
      watchlist(first: ${ETAG_CACHE_SIZE}) {
        nodes { id title type }
      }
    }
  }
}`

const friendEtagQuery = (watchlistId: string) => `query {
  userV2(user: {id: "${watchlistId}"}) {
    ... on User {
      watchlist(first: 2) {
        nodes { id }
      }
    }
  }
}`

const STAGGERED_CYCLE_MS = 5 * 60 * 1000

const STAGGERED_JITTER_PERCENT = 0.1

export class EtagPoller {
  /** ETag cache keyed by 'primary:{userId}' or 'friend:{watchlistId}' */
  private cache = new Map<string, WatchlistEtagCache>()

  /** Baselines belong to one account, so a token change invalidates them */
  private cacheToken: string | null = null

  private staggeredTimer: NodeJS.Timeout | null = null

  private isStaggeredPollingActive = false

  private staggeredPrimaryUser: EtagUserInfo | null = null

  private staggeredUserQueue: EtagUserInfo[] = []

  private staggeredCurrentIndex = 0

  private onUserChangedCallback:
    | ((result: EtagPollResult) => Promise<void>)
    | null = null

  private onCycleStartCallback: (() => Promise<EtagUserInfo[]>) | null = null

  /** Bumped on every start and stop so callbacks of a previous loop cannot re-arm the timer */
  private staggeredGeneration = 0

  // Read through the getter because the poller outlives config updates, which reassign fastify.config
  constructor(
    private readonly getConfig: () => Config,
    private readonly log: FastifyBaseLogger,
  ) {}

  async establishBaseline(user: EtagUserInfo): Promise<void> {
    const token = this.getConfig().plexTokens?.[0]
    if (!token) {
      this.log.warn('Cannot establish baseline: no Plex token configured')
      return
    }
    this.adoptToken(token)

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

  async establishAllBaselines(
    primaryUserId: number,
    friends: EtagUserInfo[],
  ): Promise<void> {
    const token = this.getConfig().plexTokens?.[0]
    if (!token) {
      this.log.warn('Cannot establish baselines: no Plex token configured')
      return
    }
    this.adoptToken(token)

    await this.establishPrimaryBaseline(token, primaryUserId)
    this.log.debug(
      { userId: primaryUserId },
      'Primary user watchlist baseline established',
    )

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

    this.log.debug(
      { friendCount: friends.length },
      'Watchlist baselines established for all users',
    )
  }

  async checkAllEtags(
    primaryUserId: number,
    friends: EtagUserInfo[],
  ): Promise<EtagPollResult[]> {
    const token = this.getConfig().plexTokens?.[0]
    if (!token) {
      this.log.warn('Cannot check watchlists: no Plex token configured')
      return []
    }
    this.adoptToken(token)

    const results: EtagPollResult[] = []

    const primaryResult = await this.checkPrimary(token, primaryUserId)
    if (primaryResult.changed || primaryResult.error) {
      results.push(primaryResult)
    }

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

  getCachedItems(user: EtagUserInfo): EtagPollItem[] {
    const cacheKey = user.isPrimary
      ? `primary:${user.userId}`
      : `friend:${user.watchlistId}`
    return this.cache.get(cacheKey)?.items ?? []
  }

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

  clearCache(): void {
    this.cache.clear()
    this.log.debug('Watchlist cache cleared')
  }

  private adoptToken(token: string): void {
    if (this.cacheToken !== null && this.cacheToken !== token) {
      this.log.info('Plex token changed, discarding ETag baselines')
      this.cache.clear()
    }
    this.cacheToken = token
  }

  getCache(): Map<string, WatchlistEtagCache> {
    return new Map(this.cache)
  }

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
    this.staggeredGeneration++
    this.onUserChangedCallback = onUserChanged
    this.onCycleStartCallback = onCycleStart

    this.staggeredPrimaryUser = {
      userId: primaryUserId,
      username: 'Primary',
      isPrimary: true,
    }

    this.staggeredUserQueue = [this.staggeredPrimaryUser, ...friends]
    this.staggeredCurrentIndex = 0

    this.log.debug(
      { userCount: this.staggeredUserQueue.length },
      'Starting staggered ETag polling (5-minute cycles)',
    )

    this.startNextCycle(this.staggeredGeneration)
  }

  stopStaggeredPolling(): void {
    if (this.staggeredTimer) {
      clearTimeout(this.staggeredTimer)
      this.staggeredTimer = null
    }

    this.isStaggeredPollingActive = false
    this.staggeredGeneration++
    this.staggeredPrimaryUser = null
    this.staggeredUserQueue = []
    this.staggeredCurrentIndex = 0
    this.onUserChangedCallback = null
    this.onCycleStartCallback = null

    this.log.debug('Staggered polling stopped')
  }

  isStaggeredPolling(): boolean {
    return this.isStaggeredPollingActive
  }

  /** A generation makes the cache write conditional on that staggered loop still being current */
  async checkUser(
    user: EtagUserInfo,
    generation?: number,
  ): Promise<EtagPollResult> {
    const token = this.getConfig().plexTokens?.[0]
    if (!token) {
      return {
        changed: false,
        userId: user.userId,
        isPrimary: user.isPrimary,
        newItems: [],
        error: 'No Plex token configured',
      }
    }
    this.adoptToken(token)

    if (user.isPrimary) {
      return this.checkPrimary(token, user.userId, generation)
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
    return this.checkFriend(token, friend, user.userId, generation)
  }

  private async startNextCycle(generation: number): Promise<void> {
    if (!this.isLoopCurrent(generation)) return

    if (this.onCycleStartCallback) {
      try {
        const updatedFriends = await this.onCycleStartCallback()
        if (!this.isLoopCurrent(generation)) return

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

    if (!this.isLoopCurrent(generation)) return

    this.staggeredCurrentIndex = 0

    this.scheduleNextUserCheck(generation)
  }

  private isLoopCurrent(generation: number): boolean {
    return (
      this.isStaggeredPollingActive && generation === this.staggeredGeneration
    )
  }

  private isStaleLoop(generation: number | undefined): boolean {
    return generation !== undefined && !this.isLoopCurrent(generation)
  }

  private scheduleNextUserCheck(generation: number): void {
    if (!this.isLoopCurrent(generation)) return

    const userCount = this.staggeredUserQueue.length
    if (userCount === 0) {
      this.staggeredTimer = setTimeout(
        () => this.startNextCycle(generation),
        STAGGERED_CYCLE_MS,
      )
      return
    }

    const baseInterval = STAGGERED_CYCLE_MS / (userCount + 1)

    const jitterRange = baseInterval * STAGGERED_JITTER_PERCENT
    const jitter = (Math.random() * 2 - 1) * jitterRange
    const interval = Math.max(1000, baseInterval + jitter)

    this.staggeredTimer = setTimeout(
      () => this.pollNextUser(generation),
      interval,
    )
  }

  private async pollNextUser(generation: number): Promise<void> {
    if (!this.isLoopCurrent(generation)) return

    const user = this.staggeredUserQueue[this.staggeredCurrentIndex]

    if (user) {
      try {
        const result = await this.checkUser(user, generation)
        if (!this.isLoopCurrent(generation)) return

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

      if (!this.isLoopCurrent(generation)) return
      this.staggeredCurrentIndex++
    }

    if (this.staggeredCurrentIndex >= this.staggeredUserQueue.length) {
      this.startNextCycle(generation).catch((error) => {
        this.log.error({ error }, 'Error starting next polling cycle')
      })
    } else {
      this.scheduleNextUserCheck(generation)
    }
  }

  private async establishPrimaryBaseline(
    token: string,
    userId: number,
    generation?: number,
  ): Promise<void> {
    const cacheKey = `primary:${userId}`

    const url = new URL(
      'https://discover.provider.plex.tv/library/sections/watchlist/all',
    )
    url.searchParams.append('X-Plex-Container-Start', '0')
    url.searchParams.append('X-Plex-Container-Size', String(ETAG_CACHE_SIZE))

    try {
      const response = await fetch(url.toString(), {
        headers: discoverHeaders(token),
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
      if (this.isStaleLoop(generation)) return

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

  private async establishFriendBaseline(
    token: string,
    friend: Friend,
    userId: number,
    generation?: number,
  ): Promise<void> {
    const cacheKey = `friend:${friend.watchlistId}`

    try {
      const itemsResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: communityHeaders(token),
        body: JSON.stringify({
          query: friendItemsQuery(friend.watchlistId),
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

      if (itemsData.errors?.length) {
        this.log.warn(
          { userId, username: friend.username, errors: itemsData.errors },
          `GraphQL errors while fetching items for friend baseline: ${itemsData.errors.map((e) => e.message).join(', ')}`,
        )
        return
      }

      const items = this.parseGraphQLItems(itemsData)

      // GraphQL ETags depend on the query, so the probe must always ask for the same 2 items
      const etagResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: communityHeaders(token),
        body: JSON.stringify({
          query: friendEtagQuery(friend.watchlistId),
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
      if (this.isStaleLoop(generation)) return

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

  private async checkPrimary(
    token: string,
    userId: number,
    generation?: number,
  ): Promise<EtagPollResult> {
    const cacheKey = `primary:${userId}`
    const cached = this.cache.get(cacheKey)

    if (!cached) {
      await this.establishPrimaryBaseline(token, userId, generation)
      return { changed: false, userId, isPrimary: true, newItems: [] }
    }

    const url = new URL(
      'https://discover.provider.plex.tv/library/sections/watchlist/all',
    )
    url.searchParams.append('X-Plex-Container-Start', '0')
    url.searchParams.append('X-Plex-Container-Size', String(ETAG_CACHE_SIZE))

    try {
      const headers = discoverHeaders(token)
      if (cached.etag) {
        headers['If-None-Match'] = cached.etag
      }

      const response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
      })

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

      if (this.isStaleLoop(generation)) {
        return { changed: false, userId, isPrimary: true, newItems: [] }
      }

      const newItems = this.diffItems(freshItems, cached.items)

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
      const errorMsg = errorMessage(error)
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

  private async checkFriend(
    token: string,
    friend: Friend,
    userId: number,
    generation?: number,
  ): Promise<EtagPollResult> {
    const cacheKey = `friend:${friend.watchlistId}`
    const cached = this.cache.get(cacheKey)

    if (!cached) {
      await this.establishFriendBaseline(token, friend, userId, generation)
      return { changed: false, userId, isPrimary: false, newItems: [] }
    }

    try {
      // The friends GraphQL API never answers 304, so a 2-item query is the cheapest change probe
      const checkResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: communityHeaders(token),
        body: JSON.stringify({
          query: friendEtagQuery(friend.watchlistId),
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

      if (newEtag && newEtag === cached.etag) {
        return { changed: false, userId, isPrimary: false, newItems: [] }
      }

      const fullResponse = await fetch('https://community.plex.tv/api', {
        method: 'POST',
        headers: communityHeaders(token),
        body: JSON.stringify({
          query: friendItemsQuery(friend.watchlistId),
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

      if (this.isStaleLoop(generation)) {
        return { changed: false, userId, isPrimary: false, newItems: [] }
      }

      const newItems = this.diffItems(freshItems, cached.items)

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
      const errorMsg = errorMessage(error)
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

  private parseDiscoverItems(data: DiscoverWatchlistResponse): EtagPollItem[] {
    const metadata = data.MediaContainer?.Metadata ?? []
    return metadata
      .filter((m) => m.key || m.ratingKey)
      .map((m) => {
        const key = discoverItemKey(m.key)
        return {
          id: key ?? m.ratingKey ?? '',
          title: m.title ?? 'Unknown',
          type: m.type ?? 'unknown',
        }
      })
  }

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

  private diffItems(
    freshItems: EtagPollItem[],
    cachedItems: EtagPollItem[],
  ): EtagPollItem[] {
    const cachedIds = new Set(cachedItems.map((item) => item.id))
    return freshItems.filter((item) => !cachedIds.has(item.id))
  }
}
