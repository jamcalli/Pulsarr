export type DeleteSyncResult = {
  total: {
    deleted: number
    skipped: number
    processed: number
    protected?: number
  }
  movies: {
    deleted: number
    skipped: number
    protected?: number
    items: ReadonlyArray<{ title: string; guid: string; instance: string }>
  }
  shows: {
    deleted: number
    skipped: number
    protected?: number
    items: ReadonlyArray<{ title: string; guid: string; instance: string }>
  }
  safetyTriggered?: boolean
  safetyMessage?: string
}
