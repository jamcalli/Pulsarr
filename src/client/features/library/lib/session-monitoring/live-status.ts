import type { StatusTone } from '@/components/status-pill'
import type { PlexLiveStatus } from '@/lib/plex-live-status'

/** The live connection as the page shows it, connecting until the server first reports. */
export type LiveState = PlexLiveStatus | 'connecting'

export const LIVE_STATE_PILLS: Record<
  LiveState,
  { tone: StatusTone; label: string }
> = {
  connected: { tone: 'on', label: 'Connected' },
  disconnected: { tone: 'pending', label: 'Polling' },
  connecting: { tone: 'off', label: 'Connecting' },
}
