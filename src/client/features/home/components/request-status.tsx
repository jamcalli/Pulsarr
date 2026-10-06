import { StatusPill, type StatusTone } from '@/components/status-pill'
import { REQUEST_STATUS_LABELS } from '@/features/home/lib/request-labels'
import type { components } from '@/types/api.js'

type RequestStatusValue = components['schemas']['RecentRequestStatus']

const STATUS_TONES: Record<RequestStatusValue, StatusTone> = {
  pending_approval: 'pending',
  pending: 'requested',
  requested: 'requested',
  available: 'available',
}

export function RequestStatus({ status }: { status: RequestStatusValue }) {
  return (
    <StatusPill
      tone={STATUS_TONES[status]}
      label={REQUEST_STATUS_LABELS[status]}
    />
  )
}
