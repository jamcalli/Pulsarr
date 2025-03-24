export type DeleteSyncResult = {
  total: {
    deleted: number
    skipped: number
    processed: number
  }
  movies: {
    deleted: number
    skipped: number
    items: Array<{ title: string; guid: string; instance: string }>
  }
  shows: {
    deleted: number
    skipped: number
    items: Array<{ title: string; guid: string; instance: string }>
  }
  safetyTriggered?: boolean
  safetyMessage?: string
}
