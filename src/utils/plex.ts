import type { FastifyBaseLogger } from 'fastify'
import type {
  PlexResponse,
  Item,
  TokenWatchlistItem,
  GraphQLQuery,
  Friend,
  PlexApiResponse,
  RssResponse,
} from '@root/types/plex.types.js'
import type { Config } from '@root/types/config.types.js'
import type { ProgressService } from '@root/types/progress.types.js'

// Custom error interface for rate limit errors
interface RateLimitError extends Error {
  isRateLimitExhausted: boolean
}

/**
 * Determines whether the provided error is a {@link RateLimitError}.
 *
 * @param error - The error to check.
 * @returns `true` if the error is a {@link RateLimitError}; otherwise, `false`.
 */
function isRateLimitError(error: unknown): error is RateLimitError {
  return (
    error instanceof Error &&
    'isRateLimitExhausted' in error &&
    (error as RateLimitError).isRateLimitExhausted === true
  )
}

// Global rate limiting control
// Using a singleton pattern to track and control rate limiting across all processes
export class PlexRateLimiter {
  private static instance: PlexRateLimiter
  private isRateLimited = false
  private cooldownEndTime = 0
  private consecutiveRateLimits = 0
  private baseMultiplier = 2 // seconds
  private maxCooldown = 30 // seconds
  private lastErrorTime = 0

  // Singleton access
  public static getInstance(): PlexRateLimiter {
    if (!PlexRateLimiter.instance) {
      PlexRateLimiter.instance = new PlexRateLimiter()
    }
    return PlexRateLimiter.instance
  }

  // Check if we're currently in a rate-limited state
  public isLimited(): boolean {
    const now = Date.now()
    // Clear rate limited state if cooldown period has passed
    if (this.isRateLimited && now > this.cooldownEndTime) {
      this.isRateLimited = false
    }
    return this.isRateLimited
  }

  // Get remaining cooldown time in ms
  public getRemainingCooldown(): number {
    if (!this.isRateLimited) return 0
    const remaining = this.cooldownEndTime - Date.now()
    return remaining > 0 ? remaining : 0
  }

  // Set rate limited state with a specific duration, or use default exponential backoff
  public setRateLimited(
    retryAfterSeconds?: number,
    log?: FastifyBaseLogger,
  ): number {
    // Track consecutive rate limits if they happen close together (within 10 seconds)
    const now = Date.now()
    if (now - this.lastErrorTime < 10000) {
      this.consecutiveRateLimits++
    } else {
      this.consecutiveRateLimits = 1
    }
    this.lastErrorTime = now

    // Calculate cooldown time
    let cooldownSeconds = retryAfterSeconds || 0

    if (!cooldownSeconds) {
      // Apply exponential backoff with consecutive failure tracking
      cooldownSeconds = Math.min(
        this.baseMultiplier * 1.5 ** (this.consecutiveRateLimits - 1),
        this.maxCooldown,
      )
    }

    // Apply jitter (±10%) to avoid thundering herd
    const jitter = cooldownSeconds * 0.1
    cooldownSeconds += Math.random() * jitter * 2 - jitter

    // Ensure final value never exceeds maxCooldown after jitter
    cooldownSeconds = Math.min(cooldownSeconds, this.maxCooldown)

    // Calculate end time of cooldown
    this.cooldownEndTime = now + cooldownSeconds * 1000
    this.isRateLimited = true

    if (log) {
      log.warn(
        `Plex rate limit detected. Cooling down ALL processes for ${cooldownSeconds.toFixed(1)}s. Consecutive rate limits: ${this.consecutiveRateLimits}`,
      )
    }

    return cooldownSeconds * 1000 // Return cooldown in ms
  }

  // Wait for cooldown if currently rate limited
  public async waitIfLimited(
    log?: FastifyBaseLogger,
    progress?: {
      progress: ProgressService
      operationId: string
      type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
      message?: string
    },
  ): Promise<boolean> {
    if (this.isLimited()) {
      const remaining = this.getRemainingCooldown()

      if (remaining <= 0) return false

      if (log) {
        log.info(
          `Waiting ${(remaining / 1000).toFixed(1)}s for Plex rate limit cooldown to expire`,
        )
      }

      if (progress) {
        progress.progress.emit({
          operationId: progress.operationId,
          type: progress.type,
          phase: 'processing',
          progress: 50, // Maintain middle progress during rate limit
          message:
            progress.message ||
            `Rate limited by Plex API. Waiting ${Math.round(remaining / 1000)}s for cooldown...`,
        })
      }

      await new Promise((resolve) => setTimeout(resolve, remaining))
      return true
    }
    return false
  }

  // Reset rate limited state (useful for testing)
  public reset(): void {
    this.isRateLimited = false
    this.cooldownEndTime = 0
    this.consecutiveRateLimits = 0
  }
}

export const pingPlex = async (
  token: string,
  log: FastifyBaseLogger,
): Promise<boolean> => {
  try {
    const url = new URL('https://plex.tv/api/v2/ping')
    url.searchParams.append('X-Plex-Token', token)
    url.searchParams.append('X-Plex-Client-Identifier', 'pulsarr')

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      log.error(
        `Plex ping failed with status ${response.status}: ${response.statusText}`,
      )
      return false
    }

    log.info('Successfully validated Plex token')
    return true
  } catch (err) {
    log.error(`Failed to validate Plex token: ${err}`)
    return false
  }
}

export const getWatchlist = async (
  token: string,
  log: FastifyBaseLogger,
  start = 0,
  retryCount = 0,
  progressInfo?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
  },
): Promise<PlexResponse> => {
  if (!token) {
    throw new Error('No Plex token provided')
  }

  // Get rate limiter instance
  const rateLimiter = PlexRateLimiter.getInstance()

  // Wait if we're already rate limited before making any API call
  await rateLimiter.waitIfLimited(log, progressInfo)

  const containerSize = 300
  const url = new URL(
    'https://metadata.provider.plex.tv/library/sections/watchlist/all',
  )
  url.searchParams.append('X-Plex-Token', token)
  url.searchParams.append('X-Plex-Container-Start', start.toString())
  url.searchParams.append('X-Plex-Container-Size', containerSize.toString())

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    })

    const contentType = response.headers.get('Content-Type')
    if (!response.ok) {
      if (response.status === 429) {
        // Get retry-after header if provided
        const retryAfter = response.headers.get('Retry-After')
        const retryAfterSec = retryAfter
          ? Number.parseInt(retryAfter, 10)
          : undefined

        // Set global rate limiter with the retry-after value
        rateLimiter.setRateLimited(retryAfterSec, log)

        if (retryCount < 3) {
          // Wait for the cooldown period
          await rateLimiter.waitIfLimited(log, progressInfo)
          // Try again after waiting
          return getWatchlist(token, log, start, retryCount + 1, progressInfo)
        }

        // Instead of returning an empty result, throw a specific error
        // that can be handled by callers
        log.warn(`Maximum retries reached for getWatchlist at start=${start}`)
        const error = new Error(
          `Rate limit exceeded: Maximum retries (${retryCount}) reached when fetching watchlist`,
        ) as RateLimitError
        error.isRateLimitExhausted = true
        throw error
      }
      throw new Error(
        `Plex API error: HTTP ${response.status} - ${response.statusText}`,
      )
    }

    if (contentType?.includes('application/json')) {
      const responseData = (await response.json()) as PlexResponse

      // Ensure that MediaContainer and Metadata exist, defaults if they do not.
      if (!responseData.MediaContainer) {
        log.info('Plex API returned empty MediaContainer')
        responseData.MediaContainer = { Metadata: [], totalSize: 0 }
      }

      if (!responseData.MediaContainer.Metadata) {
        log.info('Plex API returned MediaContainer without Metadata array')
        responseData.MediaContainer.Metadata = []
      }

      return responseData
    }

    throw new Error(`Unexpected content type: ${contentType}`)
  } catch (error) {
    // Check if the error is related to rate limiting
    const errorStr = String(error)
    if (
      errorStr.includes('429') ||
      errorStr.toLowerCase().includes('rate limit')
    ) {
      // Trigger global rate limiter
      rateLimiter.setRateLimited(undefined, log)

      if (retryCount < 3) {
        // Wait for the cooldown period
        await rateLimiter.waitIfLimited(log, progressInfo)
        // Try again after waiting
        return getWatchlist(token, log, start, retryCount + 1, progressInfo)
      }
    }

    log.error(`Error in getWatchlist: ${error}`)
    // In case of error return an empty response that matches the expected structure
    return { MediaContainer: { Metadata: [], totalSize: 0 } }
  }
}

export const fetchSelfWatchlist = async (
  config: Config,
  log: FastifyBaseLogger,
  userId: number,
): Promise<Set<TokenWatchlistItem>> => {
  const allItems = new Set<TokenWatchlistItem>()

  if (!config.plexTokens || config.plexTokens.length === 0) {
    log.warn('No Plex tokens configured')
    return allItems
  }

  for (const token of config.plexTokens) {
    let currentStart = 0

    try {
      while (true) {
        log.debug(`Fetching watchlist for token with start: ${currentStart}`)
        try {
          const response = await getWatchlist(token, log, currentStart)

          const metadata = response?.MediaContainer?.Metadata || []
          const totalSize = response?.MediaContainer?.totalSize || 0

          if (metadata.length === 0 && currentStart === 0) {
            log.info('User has no items in their watchlist')
            break
          }

          const items = metadata.map((metadata) => {
            const key = metadata.key
              ? metadata.key
                  .replace('/library/metadata/', '')
                  .replace('/children', '')
              : `temp-${Date.now()}-${Math.random()}`

            return {
              title: metadata.title || 'Unknown Title',
              id: key,
              key: key,
              thumb: metadata.thumb || null,
              type: metadata.type || 'unknown',
              guids: [],
              genres: [],
              user_id: userId,
              status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          })

          log.debug(`Found ${items.length} items in current page`)
          for (const item of items) {
            allItems.add(item as TokenWatchlistItem)
          }

          if (totalSize <= currentStart + items.length) {
            log.debug('Completed processing all pages for current token')
            break
          }

          currentStart += items.length
        } catch (innerError) {
          // Check if this is a rate limit exhaustion error
          if (isRateLimitError(innerError)) {
            log.warn(
              `Rate limit exhausted while fetching watchlist for token at start=${currentStart}. Moving to next token.`,
            )
            // Break out of the loop for this token and move on to the next one
            break
          }
          // For other errors, rethrow to be handled by outer catch
          throw innerError
        }
      }
    } catch (err) {
      log.error(`Error fetching watchlist for token: ${err}`)
    }
  }

  log.info(
    `Self watchlist fetched successfully with ${allItems.size} total items`,
  )
  return allItems
}

export const getFriends = async (
  config: Config,
  log: FastifyBaseLogger,
): Promise<Set<[Friend, string]>> => {
  const allFriends = new Set<[Friend, string]>()

  for (const token of config.plexTokens) {
    const url = new URL('https://community.plex.tv/api')
    const query: GraphQLQuery = {
      query: `query GetAllFriends {
		  allFriendsV2 {
			user {
			  id
			  username
			}
		  }
		}`,
    }

    try {
      log.debug(`Fetching friends with token: ${token}`)
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plex-Token': token,
        },
        body: JSON.stringify(query),
      })

      if (!response.ok) {
        log.warn(`Unable to fetch friends from Plex: ${response.statusText}`)
        continue
      }

      const json = (await response.json()) as PlexApiResponse
      log.debug(`Response JSON: ${JSON.stringify(json)}`)
      if (json.errors) {
        log.warn(`GraphQL errors: ${JSON.stringify(json.errors)}`)
        continue
      }

      if (json.data?.allFriendsV2) {
        const friends = json.data.allFriendsV2.map(
          (friend: { user: { id: string; username: string } }) =>
            [
              { watchlistId: friend.user.id, username: friend.user.username },
              token,
            ] as [Friend, string],
        )

        if (friends.length === 0) {
          log.warn(`No friends found for token: ${token}`)
          continue
        }

        for (const friend of friends) {
          allFriends.add(friend)
          log.debug(`Added friend: ${JSON.stringify(friend)}`)
        }
      }
    } catch (err) {
      log.warn(`Unable to fetch friends from Plex: ${err}`)
    }
  }

  log.info('All friends fetched successfully.')
  return allFriends
}

export const getWatchlistForUser = async (
  config: Config,
  log: FastifyBaseLogger,
  token: string,
  user: Friend,
  userId: number,
  page: string | null = null,
  retryCount = 0,
  maxRetries = 3,
  getAllWatchlistItems?: (userId: number) => Promise<Item[]>,
): Promise<Set<TokenWatchlistItem>> => {
  const allItems = new Set<TokenWatchlistItem>()
  const url = new URL('https://community.plex.tv/api')

  if (!user || !user.watchlistId) {
    log.error('Invalid user object provided to getWatchlistForUser')
    return allItems
  }

  const query: GraphQLQuery = {
    query: `query GetWatchlistHub ($uuid: ID!, $first: PaginationInt!, $after: String) {
      user(id: $uuid) {
        watchlist(first: $first, after: $after) {
          nodes {
            id
            title
            type
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`,
    variables: {
      uuid: user.watchlistId,
      first: 100,
      after: page,
    },
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Plex-Token': token,
      },
      body: JSON.stringify(query),
    })

    if (!response.ok) {
      throw new Error(`Plex API error: ${response.statusText}`)
    }

    const json = (await response.json()) as PlexApiResponse

    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`)
    }

    if (json.data?.user?.watchlist) {
      const watchlist = json.data.user.watchlist
      const currentTime = new Date().toISOString()

      for (const node of watchlist.nodes) {
        const item: TokenWatchlistItem = {
          ...node,
          key: node.id,
          user_id: userId,
          status: 'pending',
          created_at: currentTime,
          updated_at: currentTime,
          guids: [],
          genres: [],
        }
        allItems.add(item)
      }

      if (watchlist.pageInfo.hasNextPage && watchlist.pageInfo.endCursor) {
        const nextPageItems = await getWatchlistForUser(
          config,
          log,
          token,
          user,
          userId,
          watchlist.pageInfo.endCursor,
          retryCount,
          maxRetries,
          getAllWatchlistItems,
        )
        for (const item of nextPageItems) {
          allItems.add(item)
        }
      }
    }
  } catch (err) {
    // Check if this is a rate limit exhaustion error
    if (isRateLimitError(err)) {
      log.warn(
        `Rate limit exhausted while fetching watchlist for user ${user.username}. Propagating error.`,
      )
      // Propagate the rate limit error so the caller can handle it appropriately
      throw err
    }

    if (retryCount < maxRetries) {
      const retryDelay = Math.min(1000 * 2 ** retryCount, 10000)
      log.warn(
        `Failed to fetch watchlist for user ${user.username}. Retry ${retryCount + 1}/${maxRetries} in ${retryDelay}ms`,
      )

      await new Promise((resolve) => setTimeout(resolve, retryDelay))

      return getWatchlistForUser(
        config,
        log,
        token,
        user,
        userId,
        page,
        retryCount + 1,
        maxRetries,
        getAllWatchlistItems,
      )
    }

    log.error(
      `Unable to fetch watchlist for user ${user.username} after ${maxRetries} retries: ${err}`,
    )

    // If we have the database function, try to get existing items
    if (getAllWatchlistItems) {
      try {
        log.info(`Falling back to existing database items for user ${userId}`)
        const existingItems = await getAllWatchlistItems(userId)

        // Convert database items to TokenWatchlistItems
        for (const item of existingItems) {
          const tokenItem: TokenWatchlistItem = {
            id: item.key,
            key: item.key,
            title: item.title,
            type: item.type,
            user_id: userId,
            status: item.status || 'pending',
            created_at: item.created_at,
            updated_at: item.updated_at,
            guids: item.guids || [],
            genres: item.genres || [],
          }
          allItems.add(tokenItem)
        }

        log.info(
          `Retrieved ${existingItems.length} existing items from database for user ${userId}`,
        )
      } catch (dbError) {
        log.error(`Failed to retrieve existing items from database: ${dbError}`)
      }
    }
  }

  return allItems
}

export const getOthersWatchlist = async (
  config: Config,
  log: FastifyBaseLogger,
  friends: Set<[Friend & { userId: number }, string]>,
  getAllWatchlistItems?: (userId: number) => Promise<Item[]>,
): Promise<Map<Friend, Set<TokenWatchlistItem>>> => {
  const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>()
  log.info(`Starting fetch of watchlists for ${friends.size} friends`)

  // Simple concurrency pool implementation
  const MAX_CONCURRENT = 4 // Maximum number of concurrent friend fetches
  const friendsArray = Array.from(friends)
  const results: Array<{
    user: Friend & { userId: number }
    watchlistItems: Set<TokenWatchlistItem>
    success: boolean
  }> = []

  // Create batches of friends to process
  for (let i = 0; i < friendsArray.length; i += MAX_CONCURRENT) {
    const batch = friendsArray.slice(i, i + MAX_CONCURRENT)
    log.debug(
      `Processing batch of ${batch.length} friends (${i + 1}-${Math.min(i + batch.length, friendsArray.length)} of ${friendsArray.length})`,
    )

    // Process this batch concurrently
    const batchPromises = batch.map(async ([user, token]) => {
      log.debug(`Processing friend: ${JSON.stringify(user)}`)
      try {
        const watchlistItems = await getWatchlistForUser(
          config,
          log,
          token,
          user,
          user.userId,
          null,
          0,
          3,
          getAllWatchlistItems,
        )
        return { user, watchlistItems, success: true }
      } catch (error) {
        if (isRateLimitError(error)) {
          log.warn(
            `Rate limit exhausted while fetching watchlist for friend ${user.username}. Skipping.`,
          )
        } else {
          log.error(
            `Error fetching watchlist for friend ${user.username}: ${error}`,
          )
        }
        return {
          user,
          watchlistItems: new Set<TokenWatchlistItem>(),
          success: false,
        }
      }
    })

    // Wait for the current batch to complete before processing the next batch
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)

    // Introduce a small delay between batches to avoid rate limits
    if (i + MAX_CONCURRENT < friendsArray.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  // Add each result to the map
  for (const { user, watchlistItems, success } of results) {
    if (success && watchlistItems.size > 0) {
      userWatchlistMap.set(user, watchlistItems)
      log.debug(
        `Added ${watchlistItems.size} items for friend ${user.username}`,
      )
    }
  }

  const totalItems = Array.from(userWatchlistMap.values()).reduce(
    (acc, items) => acc + items.size,
    0,
  )
  log.info(
    `Others' watchlist fetched successfully with ${totalItems} total items from ${userWatchlistMap.size} friends`,
  )
  return userWatchlistMap
}

export const processWatchlistItems = async (
  config: Config,
  log: FastifyBaseLogger,
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  progressInfo?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
  },
): Promise<Map<Friend, Set<Item>>> => {
  const results = new Map<Friend, Set<Item>>()

  // Calculate total items for progress tracking
  const totalItems = Array.from(userWatchlistMap.values()).reduce(
    (sum, items) => sum + items.size,
    0,
  )

  if (progressInfo) {
    progressInfo.progress.emit({
      operationId: progressInfo.operationId,
      type: progressInfo.type,
      phase: 'setup',
      progress: 5,
      message: `Starting to process ${totalItems} items`,
    })
  }

  // Track completed items across all users
  let completedItems = 0

  // Process each user's watchlist
  for (const [user, watchlistItems] of userWatchlistMap.entries()) {
    log.info(
      `Processing ${watchlistItems.size} watchlist items for user ${user.username}`,
    )

    // Process items in parallel batches
    const itemsArray = Array.from(watchlistItems)
    const processedItemsMap = await toItemsBatch(
      config,
      log,
      itemsArray,
      progressInfo
        ? {
            progress: progressInfo.progress,
            operationId: progressInfo.operationId,
            type: progressInfo.type,
            completedItems,
            totalItems,
            username: user.username,
          }
        : undefined,
      2, // Concurrency limit
    )

    // Combine all items for this user
    const userItems = new Set<Item>()
    for (const itemSet of processedItemsMap.values()) {
      for (const item of itemSet) {
        userItems.add(item)
      }
    }

    if (userItems.size > 0) {
      results.set(user, userItems)
    }

    // Update completed items count
    completedItems += watchlistItems.size
  }

  if (progressInfo) {
    progressInfo.progress.emit({
      operationId: progressInfo.operationId,
      type: progressInfo.type,
      phase: 'complete',
      progress: 95,
      message: `Processed all ${totalItems} items - finalizing`,
    })
  }

  return results
}

const toItemsBatch = async (
  config: Config,
  log: FastifyBaseLogger,
  items: TokenWatchlistItem[],
  progressTracker?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
    completedItems: number
    totalItems: number
    username: string
  },
  initialConcurrencyLimit = 3, // Starting with a lower limit to prevent initial rate limiting
): Promise<Map<TokenWatchlistItem, Set<Item>>> => {
  const results = new Map<TokenWatchlistItem, Set<Item>>()
  const queue = [...items]
  let processingCount = 0
  let batchCompletedCount = 0
  let currentConcurrencyLimit = initialConcurrencyLimit

  // Track successful consecutive batches for concurrency recovery
  let consecutiveSuccessCount = 0
  const RECOVERY_THRESHOLD = 5 // Number of successful items needed before attempting recovery

  // Get the global rate limiter instance
  const rateLimiter = PlexRateLimiter.getInstance()

  // Process items in batches with controlled concurrency
  while (queue.length > 0 || processingCount > 0) {
    // Check if we're rate limited using the global rate limiter
    if (rateLimiter.isLimited()) {
      const cooldownMs = rateLimiter.getRemainingCooldown()

      // Reset consecutive success counter when rate limited
      consecutiveSuccessCount = 0

      if (progressTracker) {
        progressTracker.progress.emit({
          operationId: progressTracker.operationId,
          type: progressTracker.type,
          phase: 'processing',
          progress: Math.min(
            95,
            Math.floor((batchCompletedCount / items.length) * 90) + 5,
          ),
          message: `Rate limited by Plex API. Cooling down for ${Math.round(cooldownMs / 1000)} seconds...`,
        })
      }

      // Wait for cooldown period
      await rateLimiter.waitIfLimited(
        log,
        progressTracker
          ? {
              progress: progressTracker.progress,
              operationId: progressTracker.operationId,
              type: progressTracker.type,
              message: `Rate limited by Plex API. Cooling down for ${Math.round(cooldownMs / 1000)} seconds...`,
            }
          : undefined,
      )

      // Reduce concurrency after a rate limit to avoid hitting limits again
      currentConcurrencyLimit = Math.max(
        1,
        Math.floor(currentConcurrencyLimit * 0.7),
      )
      log.info(
        `Adjusted concurrency to ${currentConcurrencyLimit} after global rate limit cooldown`,
      )
      continue
    }

    // Start processing new items up to the concurrency limit
    while (queue.length > 0 && processingCount < currentConcurrencyLimit) {
      const item = queue.shift()
      if (item) {
        processingCount++

        // Pass progress info to toItemsSingle for rate limit notifications
        const progressInfo = progressTracker
          ? {
              progress: progressTracker.progress,
              operationId: progressTracker.operationId,
              type: progressTracker.type,
            }
          : undefined

        toItemsSingle(config, log, item, 0, 3, progressInfo)
          .then((itemSet) => {
            results.set(item, itemSet)
            processingCount--
            batchCompletedCount++
            consecutiveSuccessCount++ // Increment success counter

            // Recovery logic - increase concurrency more aggressively
            if (currentConcurrencyLimit < initialConcurrencyLimit) {
              // Faster recovery for consecutive successes
              if (consecutiveSuccessCount >= RECOVERY_THRESHOLD) {
                // More aggressive recovery after a string of successes
                currentConcurrencyLimit = Math.min(
                  currentConcurrencyLimit + 1,
                  initialConcurrencyLimit,
                )
                log.debug(
                  `Concurrency recovery: increasing to ${currentConcurrencyLimit} after ${consecutiveSuccessCount} consecutive successes`,
                )
                // Reset counter but don't drop it to zero to maintain some "credit"
                consecutiveSuccessCount = Math.floor(RECOVERY_THRESHOLD / 2)
              }
              // Also keep the gradual recovery for regular batches
              else if (batchCompletedCount % 10 === 0) {
                currentConcurrencyLimit = Math.min(
                  currentConcurrencyLimit + 1,
                  initialConcurrencyLimit,
                )
                log.debug(
                  `Gradually increasing concurrency to ${currentConcurrencyLimit}`,
                )
              }
            }

            if (progressTracker) {
              const totalCompletedItems =
                progressTracker.completedItems + batchCompletedCount
              const overallProgress =
                Math.floor(
                  (totalCompletedItems / progressTracker.totalItems) * 90,
                ) + 5

              progressTracker.progress.emit({
                operationId: progressTracker.operationId,
                type: progressTracker.type,
                phase: 'processing',
                progress: Math.min(95, overallProgress),
                message: `Processed ${totalCompletedItems} of ${progressTracker.totalItems} items`,
              })
            }
          })
          .catch((error) => {
            // Note: We don't need to handle rate limiting here specifically anymore
            // as toItemsSingle will now handle it with the global rate limiter
            // But we'll still check just in case
            // Check if this is a rate limit exhaustion error
            if (isRateLimitError(error)) {
              log.warn(
                `Rate limit exhausted while processing item ${item.title}. Putting back in queue.`,
              )
              // Put the item back in the queue
              queue.unshift(item)
              // Let the global rate limiter handle the cooldown timing
              rateLimiter.setRateLimited(undefined, log)
              // Reset consecutive success counter
              consecutiveSuccessCount = 0
              // Reduce concurrency after a rate limit exhaustion
              currentConcurrencyLimit = Math.max(
                1,
                Math.floor(currentConcurrencyLimit * 0.7),
              )
              log.info(
                `Reduced concurrency to ${currentConcurrencyLimit} after rate limit exhaustion`,
              )
            }
            // Check for other rate limit related errors
            else if (
              error.message?.includes('429') ||
              error.message?.toLowerCase().includes('rate limit')
            ) {
              // Put the item back in the queue
              queue.unshift(item)
              // Let the global rate limiter handle the cooldown timing
              rateLimiter.setRateLimited(undefined, log)
              // Reset consecutive success counter
              consecutiveSuccessCount = 0
            } else {
              log.error(`Error processing item ${item.title}:`, error)
              results.set(item, new Set())
              batchCompletedCount++
            }
            processingCount--
          })
      }
    }

    // Small delay between checks to avoid busy waiting
    if (
      processingCount >= currentConcurrencyLimit ||
      (processingCount > 0 && queue.length === 0)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  return results
}

const toItemsSingle = async (
  config: Config,
  log: FastifyBaseLogger,
  item: TokenWatchlistItem,
  retryCount = 0,
  maxRetries = 3,
  progressInfo?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
  },
): Promise<Set<Item>> => {
  // Get the global rate limiter instance
  const rateLimiter = PlexRateLimiter.getInstance()

  // Wait if we're already rate limited before making any API call
  await rateLimiter.waitIfLimited(
    log,
    progressInfo
      ? {
          ...progressInfo,
          message: `Rate limited by Plex API. Waiting before processing "${item.title}"...`,
        }
      : undefined,
  )

  try {
    const url = new URL(
      `https://discover.provider.plex.tv/library/metadata/${item.id}`,
    )
    url.searchParams.append('X-Plex-Token', config.plexTokens[0])

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    })

    // Handle rate limiting specifically
    if (response.status === 429) {
      // Get retry-after header if provided
      const retryAfter = response.headers.get('Retry-After')
      const retryAfterSec = retryAfter
        ? Number.parseInt(retryAfter, 10)
        : undefined

      // Set global rate limiter with the retry-after value
      rateLimiter.setRateLimited(retryAfterSec, log)

      if (retryCount < maxRetries) {
        // Wait for the cooldown period to expire
        await rateLimiter.waitIfLimited(
          log,
          progressInfo
            ? {
                ...progressInfo,
                message: `Rate limited by Plex API. Waiting before retrying "${item.title}"...`,
              }
            : undefined,
        )

        // Try again after waiting
        return toItemsSingle(
          config,
          log,
          item,
          retryCount + 1,
          maxRetries,
          progressInfo,
        )
      }

      log.warn(
        `Maximum retries (${maxRetries}) reached for ${item.title} due to rate limiting. Skipping item.`,
      )
      return new Set()
    }

    if (!response.ok) {
      throw new Error(
        `Plex API error: HTTP ${response.status} - ${response.statusText}`,
      )
    }

    const json = (await response.json()) as PlexApiResponse
    if (!json.MediaContainer || !json.MediaContainer.Metadata) {
      throw new Error('Invalid response structure')
    }

    const items = json.MediaContainer.Metadata.map((metadata) => ({
      title: item.title,
      key: item.id,
      type: item.type,
      thumb: item.thumb || metadata.thumb || '',
      guids: metadata.Guid?.map((guid) => guid.id.replace('//', '')) || [],
      genres: metadata.Genre?.map((genre) => genre.tag) || [],
      user_id: item.user_id,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    if (
      items.length > 0 &&
      (!items[0].guids || items[0].guids.length === 0) &&
      retryCount < maxRetries
    ) {
      log.warn(
        `Found item ${item.title} but no GUIDs. Retry ${retryCount + 1}/${maxRetries}`,
      )
      // Use exponential backoff
      const backoffDelay = Math.min(500 * 2 ** retryCount, 5000)
      await new Promise((resolve) => setTimeout(resolve, backoffDelay))
      return toItemsSingle(
        config,
        log,
        item,
        retryCount + 1,
        maxRetries,
        progressInfo,
      )
    }

    log.debug(
      `Processed metadata for item: ${item.title}${items[0]?.guids?.length ? ` with ${items[0].guids.length} GUIDs` : ''}`,
    )
    return new Set(items)
  } catch (err) {
    const error = err as Error
    const errorStr = String(error)

    // Check if error is related to rate limiting
    // Check if this is already a rate limit exhaustion error
    if (isRateLimitError(error)) {
      log.warn(
        `Rate limit already exhausted for "${item.title}". Propagating error.`,
      )
      throw error
    }

    // Check if error is related to rate limiting
    if (
      errorStr.includes('429') ||
      errorStr.toLowerCase().includes('rate limit')
    ) {
      // Trigger global rate limiter
      rateLimiter.setRateLimited(undefined, log)

      if (retryCount < maxRetries) {
        // Wait for the cooldown period
        await rateLimiter.waitIfLimited(
          log,
          progressInfo
            ? {
                ...progressInfo,
                message: `Rate limited by Plex API. Waiting before retrying "${item.title}"...`,
              }
            : undefined,
        )

        // Try again after waiting
        return toItemsSingle(
          config,
          log,
          item,
          retryCount + 1,
          maxRetries,
          progressInfo,
        )
      }

      // When retries are exhausted, create a proper error to propagate
      const rateLimitError = new Error(
        `Rate limit exceeded: Maximum retries (${maxRetries}) reached when processing item "${item.title}"`,
      ) as RateLimitError
      rateLimitError.isRateLimitExhausted = true
      throw rateLimitError
    }

    if (error.message.includes('Plex API error')) {
      if (retryCount < maxRetries) {
        log.warn(
          `Failed to find ${item.title} in Plex's database. Error: ${error.message}. Retry ${retryCount + 1}/${maxRetries}`,
        )
        // Use exponential backoff
        const backoffDelay = Math.min(500 * 2 ** retryCount, 5000)
        await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        return toItemsSingle(
          config,
          log,
          item,
          retryCount + 1,
          maxRetries,
          progressInfo,
        )
      }
    }

    log.warn(
      `Found item ${item.title} on the watchlist, but we cannot find this in Plex's database after ${maxRetries + 1} attempts. Last error: ${error.message}`,
    )
    return new Set()
  }
}

export const getPlexWatchlistUrls = async (
  tokens: Set<string>,
  skipFriendSync: boolean,
  log: FastifyBaseLogger,
): Promise<Set<string>> => {
  const watchlistsFromTokenIo = await Promise.all(
    Array.from(tokens).map(async (token) => {
      const selfWatchlist = await getRssFromPlexToken(token, 'watchlist', log)
      log.info(`Generated watchlist RSS feed for self: ${selfWatchlist}`)
      const friendsWatchlist = skipFriendSync
        ? null
        : await getRssFromPlexToken(token, 'friendsWatchlist', log)
      log.info(`Generated watchlist RSS feed for friends: ${friendsWatchlist}`)
      return [selfWatchlist, friendsWatchlist].filter(Boolean) as string[]
    }),
  )

  const watchlistsFromToken = new Set<string>(watchlistsFromTokenIo.flat())

  if (watchlistsFromToken.size === 0) {
    log.warn('Missing RSS URL. Are you an active Plex Pass user?')
    log.warn('Real-time RSS sync disabled')
  }

  return watchlistsFromToken
}

export const getRssFromPlexToken = async (
  token: string,
  rssType: string,
  log: FastifyBaseLogger,
): Promise<string | null> => {
  const url = new URL('https://discover.provider.plex.tv/rss')
  url.searchParams.append('X-Plex-Token', token)
  url.searchParams.append('X-Plex-Client-Identifier', 'pulsarr')
  url.searchParams.append('format', 'json')

  const body = JSON.stringify({ feedType: rssType })

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    })

    if (!response.ok) {
      log.warn(`Unable to generate an RSS feed: ${response.statusText}`)
      return null
    }

    const json = (await response.json()) as PlexApiResponse
    log.debug(
      'Got a result from Plex when generating RSS feed, attempting to decode',
    )
    return json.RSSInfo?.[0]?.url || null
  } catch (err) {
    log.warn(`Unable to generate an RSS feed: ${err}`)
    return null
  }
}

export const fetchWatchlistFromRss = async (
  url: string,
  prefix: 'selfRSS' | 'friendsRSS',
  userId: number,
  log: FastifyBaseLogger,
): Promise<Set<Item>> => {
  const items = new Set<Item>()

  try {
    const urlObj = new URL(url)
    urlObj.searchParams.append('format', 'json')
    urlObj.searchParams.append(
      'cache_buster',
      Math.random().toString(36).substring(2, 14),
    )

    const response = await fetch(urlObj.toString(), {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      if (response.status === 500) {
        log.debug(
          'Unable to fetch watchlist from Plex, see https://github.com/nylonee/watchlistarr/issues/161',
        )
        return items
      }
      log.warn(`Unable to fetch watchlist from Plex: ${response.statusText}`)
      return items
    }

    const json = (await response.json()) as RssResponse
    log.debug('Found Json from Plex watchlist, attempting to process')

    if (json?.items && Array.isArray(json.items)) {
      for (const metadata of json.items) {
        try {
          const item: Item = {
            title: metadata.title,
            key: `${prefix}_${Math.random().toString(36).substring(2, 15)}`,
            type: metadata.category.toUpperCase(),
            thumb: metadata.thumbnail?.url || '',
            guids: metadata.guids.map((guid) => {
              const [provider, id] = guid.split('://')
              return `${provider}:${id}`
            }),
            genres: (metadata.keywords || []).map((genre) => {
              if (genre.toLowerCase() === 'sci-fi & fantasy') {
                return 'Sci-Fi & Fantasy'
              }
              return genre
                .split(' ')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
            }),
            user_id: userId,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          items.add(item)
        } catch (err) {
          log.warn(`Failed to process item ${metadata.title}: ${err}`)
        }
      }
    }
  } catch (err) {
    log.warn(`Unable to fetch watchlist from Plex: ${err}`)
  }

  log.debug(`Successfully processed ${items.size} items from RSS feed`)
  return items
}

/**
 * Checks if the configuration includes at least one Plex token.
 *
 * @returns `true` if the configuration's `plexTokens` property is a non-empty array; otherwise, `false`.
 */
export function hasValidPlexTokens(config: Config): boolean {
  return Boolean(
    config.plexTokens &&
      Array.isArray(config.plexTokens) &&
      config.plexTokens.length > 0,
  )
}
