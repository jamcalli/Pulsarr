/**
 * Shared status type for watchlist items
 */
export type WatchlistStatus = 'pending' | 'requested' | 'grabbed' | 'notified'

export interface DatabaseWatchlistItem {
  id?: number
  user_id: number
  title: string
  key: string
  type: string
  thumb?: string | null
  added?: string | null
  guids?: string[] | string
  genres?: string[] | string
  status: WatchlistStatus
  series_status?: 'continuing' | 'ended' | null
  movie_status?: string | null
  sonarr_instance_id?: number
  radarr_instance_id?: number
  created_at?: string
  updated_at?: string
}

export interface WatchlistInstanceStatus {
  status: WatchlistStatus
  last_notified_at: string | null
  is_primary: boolean
}

export interface MainTableField {
  added?: string | null
  status?: WatchlistStatus
  series_status?: 'continuing' | 'ended' | null
  movie_status?: 'available' | 'unavailable' | null
  last_notified_at?: string | null
  title?: string
  thumb?: string | null
  guids?: string[] | string
  genres?: string[] | string
  [key: string]: string | number | boolean | string[] | null | undefined
}

export interface JunctionTableField {
  radarr_instance_id?: number | null
  sonarr_instance_id?: number | null
}

export type WatchlistItemUpdate = Partial<
  Omit<
    DatabaseWatchlistItem,
    'id' | 'user_id' | 'type' | 'key' | 'created_at' | 'updated_at'
  >
> & {
  radarr_instance_id?: number | null
  sonarr_instance_id?: number | null
  last_notified_at?: string | null
  syncing?: boolean | null
}
