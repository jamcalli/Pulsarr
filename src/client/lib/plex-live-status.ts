import type { ProgressEvent } from '@root/types/progress.types.js'
import { systemStatusFrom } from '@/lib/system-status'

const PLEX_LIVE_STATUSES = ['connected', 'disconnected'] as const

export type PlexLiveStatus = (typeof PLEX_LIVE_STATUSES)[number]

/** Null until the progress stream has reported the Plex live connection. */
export function plexLiveStatusFrom(
  event: ProgressEvent | undefined,
): PlexLiveStatus | null {
  return systemStatusFrom(event, PLEX_LIVE_STATUSES)
}
