import type { components } from '@/types/api.js'

type RequestStatusValue = components['schemas']['RecentRequestStatus']

export const REQUEST_STATUS_LABELS: Record<RequestStatusValue, string> = {
  pending_approval: 'Pending approval',
  pending: 'Pending',
  requested: 'Requested',
  available: 'Available',
}
