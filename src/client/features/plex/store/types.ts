import type {
  UpdateUser,
  BulkUpdateRequest,
} from '@root/schemas/users/users.schema'
import type { SelfWatchlistSuccess } from '@root/schemas/plex/self-watchlist-token.schema'
import type { OthersWatchlistSuccess } from '@root/schemas/plex/others-watchlist-token.schema'
import type { PingSuccess } from '@root/schemas/plex/ping.schema'
import type { RssFeedsSuccess } from '@root/schemas/plex/generate-rss-feeds.schema'
import type { UserWatchlistInfo } from '@/stores/configStore'
import type { Row } from '@tanstack/react-table'

export interface PlexConnectionValues {
  plexToken: string
}

export type ConnectionStatus =
  | 'idle'
  | 'loading'
  | 'testing'
  | 'success'
  | 'error'
export type SyncStatus = 'idle' | 'loading' | 'success' | 'error'
export type PlexUserTableRow = Row<UserWatchlistInfo>
export type BulkUpdateStatus = 'idle' | 'loading' | 'success' | 'error'

export type PlexUserUpdates = UpdateUser

export interface PlexBulkUpdateRequest extends BulkUpdateRequest {
  userIds: number[]
  updates: PlexUserUpdates
}

export type SelfWatchlistResponse = SelfWatchlistSuccess
export type OthersWatchlistResponse = OthersWatchlistSuccess
export type RssFeedsResponse = RssFeedsSuccess
export type PingResponse = PingSuccess
