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

export interface PlexUserUpdates {
  email?: string
  alias?: string | null
  notify_email?: boolean
  notify_discord?: boolean
  can_sync?: boolean
  // Allow for additional properties that might be needed
  [key: string]: string | boolean | null | undefined
}
