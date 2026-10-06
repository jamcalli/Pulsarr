import type { RecentRequest } from '@/features/home/hooks/useRecentRequests'
import { expiryLine } from '@/lib/approval'
import { ARR_TYPE_LABELS, arrTypeOf } from '@/lib/arr-labels'
import { formatRelative } from '@/lib/format'
import type { components } from '@/types/api.js'

export type StepState = 'done' | 'waiting' | 'progress' | 'todo'

export interface JourneyStep {
  label: string
  detail: string | null
  state: StepState
}

type MediaInstance = components['schemas']['RecentRequestInstance']
type WatchlistStatus = components['schemas']['WatchlistStatus']
type ApprovalRequest = components['schemas']['ApprovalRequest']

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

function sentStep(request: RecentRequest): JourneyStep {
  const names = request.allInstances.map((instance) => instance.name)
  const target =
    names.length > 0
      ? names.join(' + ')
      : ARR_TYPE_LABELS[arrTypeOf(request.contentType)]
  return {
    label: `Sent to ${target}`,
    detail: null,
    state: names.length > 0 ? 'done' : 'todo',
  }
}

function downloadedStep(
  pending: boolean,
  instance: MediaInstance | null,
): JourneyStep {
  const label = 'Downloaded'
  if (pending) return { label, detail: 'After approval', state: 'todo' }
  switch (instance?.junctionStatus) {
    case 'grabbed':
    case 'notified':
      return { label, detail: `${instance.name} has the file`, state: 'done' }
    case 'requested':
      return {
        label,
        detail: 'Sent to the instance, waiting on a release',
        state: 'progress',
      }
    default:
      return { label, detail: 'Once it is sent', state: 'todo' }
  }
}

function availableStep(instance: MediaInstance | null): JourneyStep {
  const label = 'Available'
  switch (instance?.junctionStatus) {
    case 'notified':
      return { label, detail: 'In Plex, and the user was told', state: 'done' }
    case 'grabbed':
      return {
        label,
        detail: 'Waiting for Plex to pick it up',
        state: 'progress',
      }
    default:
      return { label, detail: 'Once it is downloaded', state: 'todo' }
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
    detail: `by ${requester}, ${formatRelative(new Date(request.createdAt), now)}`,
    state: 'done',
  }
  const sent: JourneyStep = pending
    ? {
        label: 'Awaiting approval',
        detail:
          (approval && expiryLine(approval, now)?.text) ??
          'Waiting for an admin decision',
        state: 'waiting',
      }
    : sentStep(request)
  return [
    requested,
    sent,
    downloadedStep(pending, instance),
    availableStep(instance),
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
