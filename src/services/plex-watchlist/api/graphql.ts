import type {
  Friend,
  GraphQLQuery,
  Item,
  PlexApiResponse,
  PlexResponse,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import type { ProgressService } from '@root/types/progress.types.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  abortableDelay,
  PLEX_API_TIMEOUT_MS,
  parseRetryAfter,
  type RateLimitError,
} from './helpers.js'
import { PlexRateLimiter } from './rate-limiter.js'

interface ProgressInfo {
  progress: ProgressService
  operationId: string
  type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
}

const convertDbItemsToTokenWatchlistItems = (
  existingItems: Item[],
  userId: number,
  seenKeys: Set<string>,
  allItems: Set<TokenWatchlistItem>,
): void => {
  for (const item of existingItems) {
    const guids = parseGuids(item.guids)
    const genres = parseGenres(item.genres)

    const tokenItem: TokenWatchlistItem = {
      id: item.key,
      key: item.key,
      title: item.title,
      type: item.type,
      user_id: userId,
      status: item.status || 'pending',
      created_at: item.created_at,
      updated_at: item.updated_at,
      guids,
      genres,
    }
    const key = String(tokenItem.key)
    if (!seenKeys.has(key)) {
      allItems.add(tokenItem)
      seenKeys.add(key)
    }
  }
}

/** Retries rate limits up to 3 times, then throws an error with isRateLimitExhausted set. */
export const getWatchlist = async (
  token: string,
  log: FastifyBaseLogger,
  start = 0,
  retryCount = 0,
  progressInfo?: ProgressInfo,
): Promise<PlexResponse> => {
  if (!token) {
    throw new Error('No Plex token provided')
  }

  const rateLimiter = PlexRateLimiter.getInstance()

  await rateLimiter.waitIfLimited(log, progressInfo)

  const containerSize = 100
  const url = new URL(
    'https://discover.provider.plex.tv/library/sections/watchlist/all',
  )
  url.searchParams.append('X-Plex-Container-Start', start.toString())
  url.searchParams.append('X-Plex-Container-Size', containerSize.toString())

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'X-Plex-Token': token,
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT_MS),
    })

    const contentType = response.headers.get('Content-Type')
    if (!response.ok) {
      if (response.status === 429) {
        rateLimiter.setRateLimited(
          parseRetryAfter(response.headers.get('Retry-After')),
          log,
        )

        if (retryCount < 3) {
          await rateLimiter.waitIfLimited(log, progressInfo)
          return getWatchlist(token, log, start, retryCount + 1, progressInfo)
        }

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
    const errorStr = String(error)
    if (
      errorStr.includes('429') ||
      errorStr.toLowerCase().includes('rate limit')
    ) {
      rateLimiter.setRateLimited(undefined, log)

      if (retryCount < 3) {
        await rateLimiter.waitIfLimited(log, progressInfo)
        return getWatchlist(token, log, start, retryCount + 1, progressInfo)
      }

      const rateLimitError = new Error(
        `Rate limit exceeded: Maximum retries (${retryCount}) reached when fetching watchlist`,
      ) as RateLimitError
      rateLimitError.isRateLimitExhausted = true
      log.error({ error: rateLimitError }, 'Error in getWatchlist')
      throw rateLimitError
    }

    log.error({ error, start, retryCount }, 'Error in getWatchlist')
    throw error
  }
}

export interface PlexCustomListMeta {
  id: string
  name: string
  slug: string
  itemCount: number
}

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface GraphQLPageResponse {
  errors?: Array<{ message: string }>
}

interface PaginatedGraphQLOptions<TResponse extends GraphQLPageResponse> {
  token: string
  log: FastifyBaseLogger
  label: string
  maxRetries?: number
  progressInfo?: ProgressInfo
  /** Stop after this many pages; the result is then flagged as truncated */
  maxPages?: number
  /** Aborts the in-flight request and the delay between pages */
  signal?: AbortSignal
  buildQuery: (cursor: string | null) => GraphQLQuery
  castResponse: (json: unknown) => TResponse
  getPage: (
    response: TResponse,
  ) => { nodes: unknown[]; pageInfo: PageInfo } | undefined
}

interface PaginatedResult<TNode> {
  nodes: TNode[]
  truncated: boolean
}

const paginatedGraphQLFetch = async <
  TResponse extends GraphQLPageResponse,
  TNode,
>(
  options: PaginatedGraphQLOptions<TResponse>,
): Promise<TNode[]> => {
  const { nodes } = await paginatedGraphQLFetchWithMeta<TResponse, TNode>(
    options,
  )
  return nodes
}

const paginatedGraphQLFetchWithMeta = async <
  TResponse extends GraphQLPageResponse,
  TNode,
>(
  options: PaginatedGraphQLOptions<TResponse>,
): Promise<PaginatedResult<TNode>> => {
  const url = 'https://community.plex.tv/api'
  const rateLimiter = PlexRateLimiter.getInstance()
  const maxRetries = options.maxRetries ?? 3
  const allNodes: TNode[] = []
  let cursor: string | null = null
  let hasMore = true
  let retryCount = 0
  let pagesFetched = 0
  let truncated = false

  while (hasMore) {
    options.signal?.throwIfAborted()
    await rateLimiter.waitIfLimited(options.log, options.progressInfo)

    const timeout = AbortSignal.timeout(PLEX_API_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          'X-Plex-Token': options.token,
        },
        body: JSON.stringify(options.buildQuery(cursor)),
        signal: options.signal
          ? AbortSignal.any([timeout, options.signal])
          : timeout,
      })
    } catch (networkError) {
      // A caller abort is final; only timeouts and network faults are retried
      options.signal?.throwIfAborted()
      if (retryCount < maxRetries) {
        retryCount++
        const retryDelay = Math.min(1000 * 2 ** retryCount, 10000)
        options.log.warn(
          { error: networkError, attempt: retryCount },
          `Network error fetching ${options.label}, retrying in ${retryDelay}ms`,
        )
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        continue
      }
      throw networkError
    }

    if (!response.ok) {
      if (response.status === 429) {
        rateLimiter.setRateLimited(
          parseRetryAfter(response.headers.get('Retry-After')),
          options.log,
        )

        if (retryCount < maxRetries) {
          retryCount++
          continue
        }

        const err = new Error(
          `Rate limit exceeded: Maximum retries (${maxRetries}) reached when fetching ${options.label}`,
        ) as RateLimitError
        err.isRateLimitExhausted = true
        throw err
      }
      const transient = response.status >= 500 || response.status === 408
      if (transient && retryCount < maxRetries) {
        retryCount++
        const retryDelay = Math.min(1000 * 2 ** retryCount, 10000)
        options.log.warn(
          { status: response.status, attempt: retryCount },
          `HTTP ${response.status} fetching ${options.label}, retrying in ${retryDelay}ms`,
        )
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        continue
      }
      throw new Error(
        `Plex API error fetching ${options.label}: HTTP ${response.status} - ${response.statusText}`,
      )
    }

    retryCount = 0

    const json = options.castResponse(await response.json())

    if (json.errors?.length) {
      throw new Error(
        `GraphQL errors fetching ${options.label}: ${JSON.stringify(json.errors)}`,
      )
    }

    const page = options.getPage(json)
    if (!page) break

    for (const node of page.nodes as TNode[]) {
      allNodes.push(node)
    }
    pagesFetched++

    if (page.pageInfo.hasNextPage && page.pageInfo.endCursor) {
      if (options.maxPages !== undefined && pagesFetched >= options.maxPages) {
        truncated = true
        hasMore = false
        continue
      }
      cursor = page.pageInfo.endCursor
      // Delay between pagination requests per Plex developer request
      await abortableDelay(
        5_000 + Math.ceil(Math.random() * 10_000),
        options.signal,
      )
    } else {
      hasMore = false
    }
  }

  return { nodes: allNodes, truncated }
}

interface WatchlistNode {
  id: string
  title: string
  type: string
}

const buildWatchlistQuery = (
  watchlistId: string,
  cursor: string | null,
): GraphQLQuery => ({
  query: `query GetWatchlistHub ($user: UserInput!, $first: PaginationInt!, $after: String) {
          userV2(user: $user) {
            ... on User {
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
          }
        }`,
  variables: {
    user: { id: watchlistId },
    first: 100,
    after: cursor,
  },
})

const getWatchlistPage = (res: PlexApiResponse, username: string) => {
  const watchlist = res.data?.userV2?.watchlist
  if (!watchlist) {
    throw new Error(`Plex returned no watchlist payload for user ${username}`)
  }
  return watchlist
}

export interface FetchWatchlistNodesOptions {
  token: string
  log: FastifyBaseLogger
  watchlistId: string
  username: string
  maxPages?: number
  signal?: AbortSignal
}

/** Raw watchlist nodes with no DB fallback, for callers that must never write or guess. */
export const fetchWatchlistNodes = async ({
  token,
  log,
  watchlistId,
  username,
  maxPages,
  signal,
}: FetchWatchlistNodesOptions): Promise<PaginatedResult<WatchlistNode>> => {
  return paginatedGraphQLFetchWithMeta<PlexApiResponse, WatchlistNode>({
    token,
    log,
    label: `watchlist for user ${username}`,
    maxPages,
    signal,
    buildQuery: (cursor) => buildWatchlistQuery(watchlistId, cursor),
    castResponse: (json) => json as PlexApiResponse,
    getPage: (res) => getWatchlistPage(res, username),
  })
}

export interface GetWatchlistForUserOptions {
  token: string
  log: FastifyBaseLogger
  user: Friend
  userId: number
  maxRetries?: number
  getAllWatchlistItemsForUser?: (userId: number) => Promise<Item[]>
  progressInfo?: ProgressInfo
}

/** Falls back to stored DB items on fetch failure when a DB getter is given; otherwise rethrows. */
export const getWatchlistForUser = async ({
  token,
  log,
  user,
  userId,
  maxRetries,
  getAllWatchlistItemsForUser,
  progressInfo,
}: GetWatchlistForUserOptions): Promise<Set<TokenWatchlistItem>> => {
  if (!user?.watchlistId) {
    const error = 'Invalid user object provided to getWatchlistForUser'
    log.error(error)
    throw new Error(error)
  }
  const watchlistId = user.watchlistId

  const allItems = new Set<TokenWatchlistItem>()
  const seenKeys = new Set<string>()

  try {
    const nodes = await paginatedGraphQLFetch<
      PlexApiResponse,
      TokenWatchlistItem
    >({
      token,
      log,
      label: `watchlist for user ${user.username}`,
      maxRetries,
      progressInfo,
      buildQuery: (cursor) => buildWatchlistQuery(watchlistId, cursor),
      castResponse: (json) => json as PlexApiResponse,
      getPage: (res) => getWatchlistPage(res, user.username),
    })

    const currentTime = new Date().toISOString()
    for (const node of nodes) {
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
      const key = String(item.key)
      if (!seenKeys.has(key)) {
        allItems.add(item)
        seenKeys.add(key)
      }
    }
    return allItems
  } catch (err) {
    if (!getAllWatchlistItemsForUser) throw err

    log.warn(
      { error: err },
      `Unable to fetch watchlist for user ${user.username}, falling back to database items`,
    )
    try {
      const existingItems = await getAllWatchlistItemsForUser(userId)
      convertDbItemsToTokenWatchlistItems(
        existingItems,
        userId,
        seenKeys,
        allItems,
      )
      log.info(
        `Retrieved ${existingItems.length} existing items from database for user ${userId}`,
      )
      return allItems
    } catch (dbError) {
      log.error(
        { error: dbError },
        'Failed to retrieve existing items from database',
      )
      throw err
    }
  }
}

interface CustomListsResponse extends GraphQLPageResponse {
  data?: {
    userV2?: {
      customLists?: {
        nodes: PlexCustomListMeta[]
        pageInfo: PageInfo
      }
    }
  }
}

interface ListItemsPageResponse extends GraphQLPageResponse {
  data?: {
    customListBySlug?: {
      metadataItems: {
        nodes: Array<{ id: string }>
        pageInfo: PageInfo
      }
    }
  }
}

export const fetchUserListMetadata = async (
  token: string,
  log: FastifyBaseLogger,
  userUuid: string,
): Promise<PlexCustomListMeta[]> => {
  return paginatedGraphQLFetch<CustomListsResponse, PlexCustomListMeta>({
    token,
    log,
    label: `custom lists for user ${userUuid}`,
    buildQuery: (cursor) => ({
      query: `query GetCustomLists($user: UserInput!, $first: PaginationInt!, $after: String) {
        userV2(user: $user) {
          ... on User {
            customLists(first: $first, after: $after) {
              nodes {
                id
                name
                slug
                itemCount
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      variables: {
        user: { id: userUuid },
        first: 100,
        after: cursor,
      },
    }),
    castResponse: (json) => json as CustomListsResponse,
    getPage: (res) => res.data?.userV2?.customLists,
  })
}

export async function fetchListItemsBySlug(
  token: string,
  log: FastifyBaseLogger,
  slug: string,
  username: string,
): Promise<Set<string>> {
  const nodes = await paginatedGraphQLFetch<
    ListItemsPageResponse,
    { id: string }
  >({
    token,
    log,
    label: `list items for slug ${slug}`,
    buildQuery: (cursor) => ({
      query: `query GetListItems($slug: String!, $username: String!, $first: PaginationInt!, $after: String) {
        customListBySlug(slug: $slug, username: $username) {
          metadataItems(first: $first, after: $after) {
            nodes { id }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      variables: { slug, username, first: 100, after: cursor },
    }),
    castResponse: (json) => json as ListItemsPageResponse,
    getPage: (res) => res.data?.customListBySlug?.metadataItems,
  })

  return new Set(nodes.map((n) => n.id))
}
