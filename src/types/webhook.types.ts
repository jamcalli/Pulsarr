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
  episodes: QueuedWebhook['mediaInfo']['episodes']
  firstReceived: Date
  lastUpdated: Date
  timeoutId: NodeJS.Timeout
  notifiedSeasons: Set<number>
}

export interface WebhookQueue {
  [seriesId: string]: {
    seasons: {
      [seasonNumber: number]: SeasonQueue
    }
    title: string
  }
}
