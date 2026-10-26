import type { ProgressEvent } from '@root/types/progress.types.js'
import type { StatusPillView } from '@/components/status-pill'
import { systemStatusFrom } from '@/lib/system-status'

const PLEX_LIVE_STATUSES = ['connected', 'disconnected'] as const

export type PlexLiveStatus = (typeof PLEX_LIVE_STATUSES)[number]

/** Null until the progress stream has reported the Plex live connection. */
export function plexLiveStatusFrom(
  event: ProgressEvent | undefined,
): PlexLiveStatus | null {
  return systemStatusFrom(event, PLEX_LIVE_STATUSES)
}

/** The live connection as pages show it, connecting until the server first reports. */
export type LiveState = PlexLiveStatus | 'connecting'

export const LIVE_STATE_PILLS: Record<LiveState, StatusPillView> = {
  connected: { tone: 'on', label: 'Live' },
  disconnected: { tone: 'pending', label: 'Polling' },
  connecting: { tone: 'off', label: 'Connecting' },
}

export const LIVE_STATE_LINES: Record<LiveState, string> = {
  connected: 'Pulsarr hears what plays on Plex as it happens.',
  disconnected: 'Live connection down. Pulsarr polls Plex until it is back.',
  connecting: 'Waiting for Plex to report its live connection.',
}
