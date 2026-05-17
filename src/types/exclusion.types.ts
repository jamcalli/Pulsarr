export interface WatchlistExclusion {
  id: number
  user_id: number
  key: string
  excluded_at: string
}

export interface CreateExclusionData {
  key: string
  userIds: number[]
}
