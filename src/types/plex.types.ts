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
    user?: {
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
