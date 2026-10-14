import { RecentRequestStatusSchema } from '@root/schemas/shared/recent-request.schema'
import type { ChartColor } from '@/lib/chart-colors'
import type { components } from '@/types/api.js'

type RequestStatusValue = components['schemas']['RecentRequestStatus']

/** The statuses a request moves through once routed, in pipeline order. */
export const ROUTED_STATUSES = [
  'requested',
  'grabbed',
  'notified',
] as const satisfies ReadonlyArray<RequestStatusValue>

export type RoutedStatus = (typeof ROUTED_STATUSES)[number]

export const REQUEST_STATUS_LABELS: Record<RequestStatusValue, string> = {
  pending_approval: 'Pending approval',
  pending: 'Pending',
  requested: 'Requested',
  grabbed: 'Grabbed',
  notified: 'Notified',
}

export const REQUEST_STATUS_COLORS: Record<RoutedStatus, ChartColor> = {
  requested: 'chart-requested',
  grabbed: 'chart-grabbed',
  notified: 'chart-notified',
}

export const REQUEST_STATUS_OPTIONS = RecentRequestStatusSchema.options.map(
  (value) => ({ value, label: REQUEST_STATUS_LABELS[value] }),
)
