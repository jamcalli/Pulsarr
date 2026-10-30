export interface WatchlistExclusion {
  id: number
  user_id: number
  key: string
  title: string
  type: string
  guids: string[]
  excluded_at: string
}

export interface ExclusionDrivenGuids {
  movie: Set<string>
  show: Set<string>
}
