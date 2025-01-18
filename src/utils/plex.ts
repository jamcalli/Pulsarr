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

export const pingPlex = async (
  token: string,
  log: FastifyBaseLogger,
): Promise<void> => {
  try {
    const url = new URL('https://plex.tv/api/v2/ping')
    url.searchParams.append('X-Plex-Token', token)
    url.searchParams.append('X-Plex-Client-Identifier', 'watchlistarr')

    await fetch(url.toString())
    log.info('Pinged plex.tv to update access token expiry')
  } catch (err) {
    log.warn(`Unable to ping plex.tv: ${err}`)
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
    return response.json() as Promise<PlexResponse>
  }

  throw new Error(`Unexpected content type: ${contentType}`)
}

export const fetchSelfWatchlist = async (
  config: Config,
  log: FastifyBaseLogger,
  userId: number,
): Promise<Set<TokenWatchlistItem>> => {
  const allItems = new Set<TokenWatchlistItem>()

  for (const token of config.plexTokens) {
    let currentStart = 0

    while (true) {
      try {
        log.debug(`Fetching watchlist for token with start: ${currentStart}`)
        const response = await getWatchlist(token, log, currentStart)

        const items = response.MediaContainer.Metadata.map((metadata) => {
          const id = metadata.key
            .replace('/library/metadata/', '')
            .replace('/children', '')

          return {
            title: metadata.title,
            id,
            key: id,
            thumb: metadata.thumb,
            type: metadata.type,
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

        if (response.MediaContainer.totalSize <= currentStart + items.length) {
          log.debug('Completed processing all pages for current token')
          break
        }

        currentStart += items.length
      } catch (err) {
        log.error(`Error fetching watchlist: ${err}`)
        break
      }
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

  log.debug(
    `Fetching watchlist for user: ${user.username}, UUID: ${user.watchlistId}`,
  )

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
    log.debug(`Response JSON: ${JSON.stringify(json)}`)

    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`)
    }

    if (json.data?.user?.watchlist) {
      const watchlist = json.data.user.watchlist
      const currentTime = new Date().toISOString()

      for (const node of watchlist.nodes) {
        const item: TokenWatchlistItem = {
          ...node,
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
        )
        for (const item of nextPageItems) {
          allItems.add(item)
        }
      }
    }
  } catch (err) {
    log.error(`Unable to fetch watchlist for user ${user.username}: ${err}`)
  }

  return allItems
}

export const getOthersWatchlist = async (
  config: Config,
  log: FastifyBaseLogger,
  friends: Set<[Friend & { userId: number }, string]>,
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

export async function processWatchlistItems(
  config: Config,
  log: FastifyBaseLogger,
  input: Map<Friend, Set<TokenWatchlistItem>> | Set<TokenWatchlistItem>,
): Promise<Map<Friend, Set<Item>> | Set<Item>> {
  if (input instanceof Map) {
    const userDetailedWatchlistMap = new Map<Friend, Set<Item>>()

    for (const [user, watchlistItems] of input) {
      const detailedItems = new Set<Item>()
      for (const item of watchlistItems) {
        const items = await toItems(config, log, item)
        for (const detailedItem of items) {
          detailedItems.add(detailedItem)
        }
      }
      userDetailedWatchlistMap.set(user, detailedItems)
    }

    return userDetailedWatchlistMap
  }

  const detailedItems = new Set<Item>()
  for (const item of input) {
    const items = await toItems(config, log, item)
    for (const detailedItem of items) {
      detailedItems.add(detailedItem)
    }
  }
  return detailedItems
}

const toItems = async (
  config: Config,
  log: FastifyBaseLogger,
  item: TokenWatchlistItem,
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
    })

    if (!response.ok) {
      throw new Error(`Plex API error: ${response.statusText}`)
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

    log.debug(`Processed metadata for item: ${item.title}`)
    return new Set(items)
  } catch (err) {
    const error = err as Error
    if (error.message.includes('Plex API error')) {
      log.warn(
        `Found item ${item.title} on the watchlist, but we cannot find this in Plex's database.`,
      )
    } else {
      log.error(`Unable to fetch item details for ${item.title}: ${error}`)
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
  url.searchParams.append('X-Plex-Client-Identifier', 'watchlistarr')
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
  prefix: 'selfRSS' | 'otherRSS',
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
