import { ApprovalTriggerSchema } from '@root/schemas/approval/approval.schema'
import { ContentTypeSchema } from '@root/schemas/common/content-type.schema'
import { APPROVAL_STATUS_LABELS, TRIGGER_LABELS } from '@/lib/approval'
import { CONTENT_TYPE_PLURAL_LABELS } from '@/lib/content-type'
import type { components, paths } from '@/types/api.js'

type ApprovalTrigger = components['schemas']['ApprovalTrigger']
type ContentType = components['schemas']['ContentType']
type RequestsQuery = NonNullable<
  paths['/v1/approval/requests']['get']['parameters']['query']
>

export type QueueTab = 'pending' | 'history'
export type HistoryStatus =
  | 'all'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'auto_approved'
export type QueueSortKey =
  | 'title'
  | 'requester'
  | 'trigger'
  | 'requested'
  | 'status'
export type SortDirection = 'asc' | 'desc'

export interface QueueState {
  tab: QueueTab
  status: HistoryStatus
  user: number | null
  type: ContentType | null
  trigger: ApprovalTrigger | null
  q: string
  sort: QueueSortKey
  dir: SortDirection
  /** One-based. */
  page: number
}

export const QUEUE_PAGE_SIZE = 20

export const QUEUE_TABS: ReadonlyArray<{ value: QueueTab; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'history', label: 'History' },
]

export const DECIDED_STATUSES = [
  'approved',
  'rejected',
  'expired',
  'auto_approved',
] as const satisfies ReadonlyArray<Exclude<HistoryStatus, 'all'>>

export const HISTORY_STATUS_OPTIONS: ReadonlyArray<{
  value: HistoryStatus
  label: string
}> = [
  { value: 'all', label: 'All' },
  ...DECIDED_STATUSES.map((value) => ({
    value,
    label: APPROVAL_STATUS_LABELS[value],
  })),
]

export const CONTENT_TYPE_FILTER_OPTIONS: ReadonlyArray<{
  value: ContentType
  label: string
}> = ContentTypeSchema.options.map((value) => ({
  value,
  label: CONTENT_TYPE_PLURAL_LABELS[value],
}))

export const TRIGGER_FILTER_OPTIONS: ReadonlyArray<{
  value: ApprovalTrigger
  label: string
}> = ApprovalTriggerSchema.options.map((value) => ({
  value,
  label: TRIGGER_LABELS[value],
}))

export const SORTABLE: Record<QueueTab, readonly QueueSortKey[]> = {
  pending: ['requested', 'title', 'requester', 'trigger'],
  history: ['requested', 'title', 'requester', 'trigger', 'status'],
}

const DEFAULT_SORT: Record<
  QueueTab,
  { sort: QueueSortKey; dir: SortDirection }
> = {
  pending: { sort: 'requested', dir: 'asc' },
  history: { sort: 'requested', dir: 'desc' },
}

const SORT_FIELDS: Record<QueueSortKey, RequestsQuery['sortBy']> = {
  title: 'contentTitle',
  requester: 'userName',
  trigger: 'triggeredBy',
  requested: 'createdAt',
  status: 'status',
}

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  return allowed.find((option) => option === value) ?? null
}

function positiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return parsed >= 1 ? parsed : null
}

const TRIGGERS = TRIGGER_FILTER_OPTIONS.map(({ value }) => value)
const CONTENT_TYPES = CONTENT_TYPE_FILTER_OPTIONS.map(({ value }) => value)
const STATUSES = HISTORY_STATUS_OPTIONS.map(({ value }) => value)

/** Unknown or out-of-place values fall back to the tab's defaults. */
export function parseQueueState(params: URLSearchParams): QueueState {
  const tab = params.get('tab') === 'history' ? 'history' : 'pending'
  const fallback = DEFAULT_SORT[tab]
  const sort = oneOf(params.get('sort'), SORTABLE[tab])
  const dir = oneOf(params.get('dir'), ['asc', 'desc'] as const)

  return {
    tab,
    status:
      tab === 'history'
        ? (oneOf(params.get('status'), STATUSES) ?? 'all')
        : 'all',
    user: positiveInt(params.get('user')),
    type: oneOf(params.get('type'), CONTENT_TYPES),
    trigger: oneOf(params.get('trigger'), TRIGGERS),
    q: params.get('q') ?? '',
    sort: sort ?? fallback.sort,
    dir: sort === null ? fallback.dir : (dir ?? 'asc'),
    page: positiveInt(params.get('page')) ?? 1,
  }
}

/** Leaves out every value that equals its default. */
export function serializeQueueState(state: QueueState): URLSearchParams {
  const params = new URLSearchParams()
  const fallback = DEFAULT_SORT[state.tab]
  if (state.tab !== 'pending') params.set('tab', state.tab)
  if (state.tab === 'history' && state.status !== 'all') {
    params.set('status', state.status)
  }
  if (state.user !== null) params.set('user', String(state.user))
  if (state.type !== null) params.set('type', state.type)
  if (state.trigger !== null) params.set('trigger', state.trigger)
  if (state.q !== '') params.set('q', state.q)
  if (state.sort !== fallback.sort || state.dir !== fallback.dir) {
    params.set('sort', state.sort)
    params.set('dir', state.dir)
  }
  if (state.page !== 1) params.set('page', String(state.page))
  return params
}

/** Changes whenever the visible rows could change, which is when a selection stops applying. */
export function selectionScope(state: QueueState): string {
  return serializeQueueState(state).toString()
}

export function withTab(state: QueueState, tab: QueueTab): QueueState {
  return { ...state, tab, status: 'all', ...DEFAULT_SORT[tab], page: 1 }
}

export function withoutFilters(state: QueueState): QueueState {
  return { ...state, user: null, type: null, trigger: null, q: '', page: 1 }
}

export function hasFilters(state: QueueState): boolean {
  return filterCount(state) > 0 || state.q.trim() !== ''
}

/** Counts the select filters, not the search, for the phone Filters button. */
export function filterCount(state: QueueState): number {
  return [state.user, state.type, state.trigger].filter(
    (value) => value !== null,
  ).length
}

export function requestQuery(state: QueueState) {
  const status =
    state.tab === 'pending'
      ? 'pending'
      : state.status === 'all'
        ? DECIDED_STATUSES.join(',')
        : state.status
  return {
    status,
    userId: state.user === null ? undefined : String(state.user),
    contentType: state.type ?? undefined,
    triggeredBy: state.trigger ?? undefined,
    search: state.q.trim() || undefined,
    sortBy: SORT_FIELDS[state.sort],
    sortOrder: state.dir,
    limit: QUEUE_PAGE_SIZE,
    offset: (state.page - 1) * QUEUE_PAGE_SIZE,
  } satisfies RequestsQuery
}
