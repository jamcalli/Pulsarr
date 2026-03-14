/**
 * Timeline Debouncer
 *
 * Filters Plex SSE timeline events for completed metadata scans (state 5)
 * and debounces rapid bursts into a single callback. When Plex scans a show
 * it emits events for the show, each season, and each episode in rapid
 * succession - this collapses them into one "content scanned" signal.
 */

import type { PlexTimelineEntry } from '@root/types/plex-session.types.js'

export interface ContentScannedEvent {
  itemIDs: Set<number>
}

export type ContentScannedHandler = (event: ContentScannedEvent) => void

// Plex metadata types we care about
const RELEVANT_TYPES = new Set([1, 2, 3, 4]) // 1=movie, 2=show, 3=season, 4=episode

// Quiet period before firing the debounced callback
const DEBOUNCE_MS = 2_000

export class TimelineDebouncer {
  private pendingIDs = new Set<number>()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private handlers: ContentScannedHandler[] = []

  handleTimelineEntries(entries: PlexTimelineEntry[]): void {
    let hasNew = false

    for (const entry of entries) {
      if (
        entry.state === 5 &&
        entry.identifier === 'com.plexapp.plugins.library' &&
        entry.sectionID > 0 &&
        RELEVANT_TYPES.has(entry.type)
      ) {
        this.pendingIDs.add(entry.itemID)
        hasNew = true
      }
    }

    if (hasNew) {
      this.resetTimer()
    }
  }

  onContentScanned(handler: ContentScannedHandler): void {
    this.handlers.push(handler)
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingIDs.clear()
    this.handlers = []
  }

  private resetTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.flush()
    }, DEBOUNCE_MS)
  }

  private flush(): void {
    this.debounceTimer = null
    if (this.pendingIDs.size === 0) return

    const event: ContentScannedEvent = { itemIDs: new Set(this.pendingIDs) }
    this.pendingIDs.clear()

    for (const handler of this.handlers) {
      handler(event)
    }
  }
}
