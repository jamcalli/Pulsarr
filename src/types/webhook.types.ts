export interface QueuedWebhook {
  mediaInfo: {
    type: 'show'
    guid: string
    title: string
    episodes: {
      seasonNumber: number
      episodeNumber: number
      title: string
      overview?: string
      airDateUtc: string
    }[]
  }
  receivedAt: Date
  lastUpdated: Date
}

export interface SeasonQueue {
  episodes: Array<{
    episodeNumber: number
    seasonNumber: number
    title: string
    overview?: string
    airDateUtc: string
  }>
  firstReceived: Date
  lastUpdated: Date
  notifiedSeasons: Set<number>
  timeoutId?: ReturnType<typeof setTimeout>
  // Captured together when the season queue is created: Sonarr series IDs and
  // rolling monitoring type are per-instance, so they must match this season's instance.
  instanceId?: number | null
  sonarrSeriesId?: number
  isPilotRolling?: boolean
  expectedEpisodeCount?: number
}

export interface WebhookQueue {
  [tvdbId: string]: {
    seasons: {
      [seasonNumber: number]: SeasonQueue
    }
    title: string
  }
}
