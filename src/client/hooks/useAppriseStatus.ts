import {
  APPRISE_STATUSES,
  type AppriseStatus,
} from '@root/types/notification.types.js'
import { systemStatusFrom } from '@/lib/system-status'
import { useProgressStore } from '@/stores/progressStore'

export function useAppriseStatus(): AppriseStatus | null {
  const event = useProgressStore(
    (state) => state.systemStatusCache['apprise-status'],
  )
  return systemStatusFrom(event, APPRISE_STATUSES)
}
