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
): Promise<PlexResponse> => {
  if (!token) {
    throw new Error('No Plex token provided')
  }
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
        const retryAfter = response.headers.get('Retry-After')
        const retryAfterMs = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : 1000 * 2 ** retryCount
        log.warn(
          `Rate limited. Retrying after ${retryAfterMs} ms. Attempt ${retryCount + 1}`,
        )
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
        return getWatchlist(token, log, start, retryCount + 1)
      }
      throw new Error(`Plex API error: ${response.statusText}`)
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
    log.error(`Error in getWatchlist: ${error}`)
    // Incase of error return an empty response that matches the expected structure
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
  for (const [user, token] of friends) {
    log.debug(`Processing friend: ${JSON.stringify(user)}`)
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
    userWatchlistMap.set(user, watchlistItems)
  }

  const totalItems = Array.from(userWatchlistMap.values()).reduce(
    (acc, items) => acc + items.size,
    0,
  )
  log.info(
    `Others' watchlist fetched successfully with ${totalItems} total items`,
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
  initialConcurrencyLimit = 5,
): Promise<Map<TokenWatchlistItem, Set<Item>>> => {
  const results = new Map<TokenWatchlistItem, Set<Item>>()
  const queue = [...items]
  let processingCount = 0
  let batchCompletedCount = 0
  let isRateLimited = false
  let currentConcurrencyLimit = initialConcurrencyLimit
  let consecutiveRateLimits = 0
  let cooldownTime = 2000 // Start with 2 seconds

  // Process items in batches with controlled concurrency
  while (queue.length > 0 || processingCount > 0) {
    // If rate limited, pause all processing with adaptive cooldown
    if (isRateLimited) {
      // Increase cooldown time if we've had multiple consecutive rate limits
      const adaptiveCooldown =
        consecutiveRateLimits > 1
          ? Math.min(cooldownTime * 1.5, 30000) // Exponential up to 30s max
          : cooldownTime

      // Add slight randomization (±10%)
      const finalCooldown = adaptiveCooldown * (0.9 + Math.random() * 0.2)

      if (progressTracker) {
        progressTracker.progress.emit({
          operationId: progressTracker.operationId,
          type: progressTracker.type,
          phase: 'processing',
          progress: Math.min(
            95,
            Math.floor((batchCompletedCount / items.length) * 90) + 5,
          ),
          message: `Rate limited by Plex API. Cooling down for ${Math.round(finalCooldown / 1000)} seconds...`,
        })
      }
      log.warn(
        `Rate limit detected, pausing all requests for ${Math.round(finalCooldown / 1000)} seconds`,
      )
      await new Promise((resolve) => setTimeout(resolve, finalCooldown))
      isRateLimited = false

      // After cooldown, reduce concurrency based on consecutive rate limits
      if (consecutiveRateLimits > 1) {
        currentConcurrencyLimit = Math.max(
          1,
          Math.floor(currentConcurrencyLimit * 0.6),
        )
      } else {
        currentConcurrencyLimit = Math.max(1, currentConcurrencyLimit - 1)
      }

      log.info(
        `Adjusted concurrency to ${currentConcurrencyLimit} after cooldown`,
      )
      continue
    }

    // Start processing new items up to the concurrency limit
    while (queue.length > 0 && processingCount < currentConcurrencyLimit) {
      const item = queue.shift()
      if (item) {
        processingCount++
        toItemsSingle(config, log, item)
          .then((itemSet) => {
            results.set(item, itemSet)
            processingCount--
            batchCompletedCount++
            consecutiveRateLimits = 0 // Reset on success

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
            if (
              error.message?.includes('429') ||
              error.message?.toLowerCase().includes('rate limit')
            ) {
              // Put the item back in the queue
              queue.unshift(item)
              isRateLimited = true
              consecutiveRateLimits++
              cooldownTime = Math.min(cooldownTime * 1.5, 30000) // Increase cooldown for next time
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
  maxRetries = 2,
): Promise<Set<Item>> => {
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
      const backoffDelay = Math.min(200 * 1.5 ** retryCount, 1000)
      await new Promise((resolve) => setTimeout(resolve, backoffDelay))
      return toItemsSingle(config, log, item, retryCount + 1, maxRetries)
    }

    log.debug(
      `Processed metadata for item: ${item.title}${items[0]?.guids?.length ? ` with ${items[0].guids.length} GUIDs` : ''}`,
    )
    return new Set(items)
  } catch (err) {
    const error = err as Error
    if (error.message.includes('Plex API error')) {
      if (retryCount < maxRetries) {
        log.warn(
          `Failed to find ${item.title} in Plex's database. Error: ${error.message}. Retry ${retryCount + 1}/${maxRetries}`,
        )
        // Use exponential backoff
        const backoffDelay = Math.min(200 * 1.5 ** retryCount, 1000)
        await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        return toItemsSingle(config, log, item, retryCount + 1, maxRetries)
      }
      log.warn(
        `Found item ${item.title} on the watchlist, but we cannot find this in Plex's database after ${maxRetries + 1} attempts. Last error: ${error.message}`,
      )
    } else {
      log.error(
        `Unable to fetch item details for ${item.title} after ${retryCount + 1} attempts: ${error}`,
      )
    }
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
 * Checks if the configuration includes a non-empty array of Plex tokens.
 *
 * @param config - The configuration object to validate.
 * @returns `true` if Plex tokens are present and valid; otherwise, `false`.
 */
export function hasValidPlexTokens(config: Config): boolean {
  return Boolean(
    config.plexTokens &&
      Array.isArray(config.plexTokens) &&
      config.plexTokens.length > 0,
  )
}
