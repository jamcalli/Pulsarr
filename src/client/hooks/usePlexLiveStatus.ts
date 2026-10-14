import { type PlexLiveStatus, plexLiveStatusFrom } from '@/lib/plex-live-status'
import { useProgressStore } from '@/stores/progressStore'

export function usePlexLiveStatus(): PlexLiveStatus | null {
  const event = useProgressStore(
    (state) => state.systemStatusCache['plex-sse-status'],
  )
  return plexLiveStatusFrom(event)
}
