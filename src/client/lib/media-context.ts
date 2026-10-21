import { expiryLine } from '@/lib/approval'
import { ARR_TYPE_LABELS, arrTypeOf } from '@/lib/arr-labels'
import { formatDateTime } from '@/lib/format'
import type { RecentRequest } from '@/lib/media-item'
import type { components } from '@/types/api.js'

export type StepState = 'done' | 'waiting' | 'progress' | 'todo'

export interface JourneyStep {
  label: string
  detail: string | null
  /** When a done step happened, null when there is no record. */
  time: string | null
  state: StepState
}

type MediaInstance = components['schemas']['RecentRequestInstance']
type WatchlistStatus = components['schemas']['WatchlistStatus']
type ApprovalRequest = components['schemas']['ApprovalRequest']
type StatusTimes = components['schemas']['RecentRequestStatusTimes']

export interface MediaContext {
  journey: JourneyStep[] | null
  instances: MediaInstance[]
  watchers: string[]
}

interface MediaContextInput {
  displayName: (username: string) => string
  request?: RecentRequest
  watchers?: string[]
  approval?: ApprovalRequest | null
  now?: number
}

const JUNCTION_ORDER: WatchlistStatus[] = [
  'pending',
  'requested',
  'grabbed',
  'notified',
]

function furthestInstance(request: RecentRequest): MediaInstance | null {
  if (request.primaryInstance) return request.primaryInstance
  return request.allInstances.reduce<MediaInstance | null>(
    (best, instance) =>
      best &&
      JUNCTION_ORDER.indexOf(best.junctionStatus) >=
        JUNCTION_ORDER.indexOf(instance.junctionStatus)
        ? best
        : instance,
    null,
  )
}

function at(time: string | null): string | null {
  return time ? formatDateTime(new Date(time)) : null
}

function sentStep(request: RecentRequest): JourneyStep {
  const names = request.allInstances.map((instance) => instance.name)
  const sent = names.length > 0
  const target = sent
    ? names.join(' + ')
    : ARR_TYPE_LABELS[arrTypeOf(request.contentType)]
  return {
    label: `Sent to ${target}`,
    detail: null,
    time: sent ? at(request.statusTimes.requested) : null,
    state: sent ? 'done' : 'todo',
  }
}

function downloadedStep(
  pending: boolean,
  instance: MediaInstance | null,
  times: StatusTimes,
): JourneyStep {
  const label = 'Download'
  const time = null
  if (pending) return { label, detail: 'After approval', time, state: 'todo' }
  switch (instance?.junctionStatus) {
    case 'grabbed':
    case 'notified':
      return {
        label,
        detail: `${instance.name} has the file`,
        time: at(times.grabbed),
        state: 'done',
      }
    case 'requested':
      return {
        label,
        detail: `${instance.name} has no file yet`,
        time,
        state: 'progress',
      }
    default:
      return { label, detail: 'Once it is sent', time, state: 'todo' }
  }
}

function notifiedStep(
  instance: MediaInstance | null,
  times: StatusTimes,
): JourneyStep {
  const label = 'Notification'
  const time = null
  switch (instance?.junctionStatus) {
    case 'notified':
      return {
        label,
        detail: 'The user was told',
        time: at(times.notified),
        state: 'done',
      }
    case 'grabbed':
      return { label, detail: 'No notification yet', time, state: 'progress' }
    default:
      return { label, detail: 'Once it is downloaded', time, state: 'todo' }
  }
}

function journeyOf(
  request: RecentRequest,
  requester: string,
  approval: ApprovalRequest | null,
  now: number,
): JourneyStep[] {
  const pending = request.status === 'pending_approval'
  const instance = furthestInstance(request)
  const requested: JourneyStep = {
    label: 'Requested',
    detail: `by ${requester}`,
    time: at(request.createdAt),
    state: 'done',
  }
  const sent: JourneyStep = pending
    ? {
        label: 'Awaiting approval',
        detail:
          (approval && expiryLine(approval, now)?.text) ??
          'Waiting for an admin decision',
        time: null,
        state: 'waiting',
      }
    : sentStep(request)
  return [
    requested,
    sent,
    downloadedStep(pending, instance, request.statusTimes),
    notifiedStep(instance, request.statusTimes),
  ]
}

export function mediaContext({
  displayName,
  request,
  watchers = [],
  approval = null,
  now = Date.now(),
}: MediaContextInput): MediaContext {
  return {
    journey: request
      ? journeyOf(request, displayName(request.userName), approval, now)
      : null,
    instances: request?.allInstances ?? [],
    watchers,
  }
}
