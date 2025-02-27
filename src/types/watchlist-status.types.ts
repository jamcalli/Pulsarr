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
  status: 'pending' | 'requested' | 'grabbed' | 'notified'
  series_status?: 'continuing' | 'ended' | null
  movie_status?: string | null
  sonarr_instance_id?: number
  radarr_instance_id?: number
  created_at?: string
  updated_at?: string
}
