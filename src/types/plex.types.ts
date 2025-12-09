export interface PlexResponse {
  MediaContainer: {
    Metadata: Array<{
      title: string
      key: string
      type: string
      thumb: string
      Guid?: Array<{ id: string }>
      Genre?: Array<{ tag: string }>
    }>
    totalSize: number
  }
}

export interface Friend {
  watchlistId: string
  username: string
  userId: number
}

export interface FriendsResult {
  friends: Set<[Friend, string]>
  success: boolean
  hasApiErrors: boolean
}

export interface WatchlistItem {
  title: string
  plexKey: string
  type: string
  thumb: string
  guids: string[]
  genres: string[]
  status: 'pending'
}

export interface WatchlistGroup {
  user: Friend
  watchlist: WatchlistItem[]
}

export interface WatchlistResponse {
  total: number
  users: WatchlistGroup[]
}

export interface RssWatchlistResults {
  self: WatchlistResponse
  friends: WatchlistResponse
}

export interface Item {
  title: string
  key: string
  type: string
  thumb?: string
  added?: string
  guids?: string[] | string
  genres?: string[] | string
  user_id: number
  status: 'pending' | 'requested' | 'grabbed' | 'notified'
  series_status?: 'continuing' | 'ended'
  movie_status?: 'available' | 'unavailable'
  sonarr_instance_id?: number
  radarr_instance_id?: number
  last_notified_at?: string
  sync_started_at?: string
  created_at: string
  updated_at: string
}

export interface TokenWatchlistItem extends Item {
  id: string
}

export interface GraphQLError {
  message: string
  extensions?: {
    code?: string
    field?: string
    context?: Array<{
      arg?: string
      value?: string
    }>
  }
}

export interface GraphQLQuery {
  query: string
  variables?: Record<string, unknown>
}

interface PlexGraphQLError {
  message: string
  locations?: Array<{
    line: number
    column: number
  }>
  path?: string[]
  extensions?: {
    code?: string
    [key: string]: unknown
  }
}

export interface PlexApiResponse {
  MediaContainer?: {
    Metadata?: Array<{
      Guid?: Array<{ id: string }>
      Genre?: Array<{ tag: string }>
      thumb?: string
    }>
  }
  errors?: PlexGraphQLError[]
  data?: {
    allFriendsV2?: Array<{ user: { id: string; username: string } }>
    userV2?: {
      watchlist?: {
        nodes: Array<TokenWatchlistItem>
        pageInfo: {
          hasNextPage: boolean
          endCursor: string
        }
      }
    }
  }
  RSSInfo?: Array<{ url: string }>
}

export interface RssWatchlistItem {
  title: string
  pubDate: string
  link: string
  guids: string[]
  description: string
  category: string
  credits: Array<{
    credit: string
    role: string
  }>
  thumbnail?: {
    url: string
  }
  keywords?: string[]
  /**
   * Plex user UUID (hex string) who added this item.
   * Maps to allFriendsV2 GraphQL id field for friend lookups.
   * Present in both self and friends RSS feeds.
   */
  author?: string
  /**
   * Content rating information (e.g., pg-13, r)
   */
  rating?: {
    rating?: string
    scheme?: string
  }
}

export interface TemptRssWatchlistItem {
  title: string
  key: string
  type: string
  thumb?: string
  guids?: string | string[]
  genres?: string | string[]
}

export interface RssResponse {
  title: string
  links: {
    self: string
    next?: string
  }
  description: string
  items: RssWatchlistItem[]
}

// ============================================================================
// ETag Polling Types
// ============================================================================

/** Discover API response for primary user watchlist polling */
export interface DiscoverWatchlistResponse {
  MediaContainer?: {
    Metadata?: Array<{
      key?: string
      title?: string
      type?: string
      ratingKey?: string
      thumb?: string
    }>
    totalSize?: number
  }
}

/** GraphQL watchlist response for ETag polling (simplified subset of PlexApiResponse) */
export interface GraphQLWatchlistPollResponse {
  data?: {
    userV2?: {
      watchlist?: {
        nodes: EtagPollItem[]
      }
    }
  }
  errors?: Array<{ message: string }>
}

/** Cached ETag data for a user's watchlist */
export interface WatchlistEtagCache {
  /** ETag from 2-item query (for change detection), null if API didn't return one */
  etag: string | null
  /** Timestamp of last check */
  lastCheck: number
  /** Cached items for diffing to find new items */
  items: EtagPollItem[]
}

/** Result of an ETag poll operation */
export interface EtagPollResult {
  /** Whether the watchlist has changed since last poll */
  changed: boolean
  /** User ID associated with this watchlist */
  userId: number
  /** Whether this is the primary user's watchlist */
  isPrimary: boolean
  /** NEW items found by diffing fresh vs cached (for instant routing) */
  newItems: EtagPollItem[]
  /** Error message if poll failed */
  error?: string
}

/** Minimal watchlist item from ETag poll response */
export interface EtagPollItem {
  id: string
  title: string
  type: string
}

/** User info for ETag polling and friend change tracking */
export interface EtagUserInfo {
  userId: number
  username: string
  watchlistId?: string // Only for friends (GraphQL ID), undefined for primary
  isPrimary: boolean
}

/** Result of friend change detection */
export interface FriendChangesResult {
  /** Newly added friends with their info */
  added: EtagUserInfo[]
  /** Removed friends with their info */
  removed: EtagUserInfo[]
  /** Map of watchlistId to userId for all current friends */
  userMap: Map<string, number>
}
