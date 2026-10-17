import {
  PLEX_MOBILE_STATUSES,
  type PlexMobileStatus,
} from '@root/types/notification.types.js'
import { systemStatusFrom } from '@/lib/system-status'
import { useProgressStore } from '@/stores/progressStore'

export function usePlexMobileStatus(): PlexMobileStatus | null {
  const event = useProgressStore(
    (state) => state.systemStatusCache['plex-mobile-status'],
  )
  return systemStatusFrom(event, PLEX_MOBILE_STATUSES)
}
