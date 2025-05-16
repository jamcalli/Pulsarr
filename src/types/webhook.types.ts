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

export interface RecentWebhook {
  timestamp: number
  isUpgrade: boolean
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
  timeoutId: NodeJS.Timeout
  upgradeTracker: Map<string, RecentWebhook[]>
  instanceId?: number | null
}

export interface WebhookQueue {
  [tvdbId: string]: {
    seasons: {
      [seasonNumber: number]: SeasonQueue
    }
    title: string
  }
}
