export class NotificationState {
  /** Debounce timers keyed by userId:contentType. */
  readonly watchlistCapTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Keyed by userId:contentType. An unchanged count suppresses the next notification. */
  readonly watchlistCapCounts = new Map<string, number>()

  clearTimers(): void {
    for (const timer of this.watchlistCapTimers.values()) clearTimeout(timer)
    this.watchlistCapTimers.clear()
  }
}
