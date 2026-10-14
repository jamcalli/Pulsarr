import {
  RELATIONSHIP_FILTER_OPTIONS,
  type TrackedStatus,
} from '@/features/users/lib/relationship'
import {
  oneOf,
  positiveInt,
  SORT_DIRECTIONS,
  type SortDirection,
} from '@/lib/url-state'

export type UsersSortKey = 'user' | 'watchlist'
export type Toggle = 'on' | 'off'

export interface UsersState {
  q: string
  rel: TrackedStatus | null
  sync: Toggle | null
  appr: Toggle | null
  sort: UsersSortKey
  dir: SortDirection
  /** One-based. */
  page: number
}

export const USERS_SORTABLE: readonly UsersSortKey[] = ['user', 'watchlist']

const DEFAULT_SORT = { sort: 'user', dir: 'asc' } as const satisfies {
  sort: UsersSortKey
  dir: SortDirection
}

const TOGGLES: readonly Toggle[] = ['on', 'off']

export const SYNC_FILTER_OPTIONS: ReadonlyArray<{
  value: Toggle
  label: string
}> = [
  { value: 'on', label: 'Syncing' },
  { value: 'off', label: 'Not syncing' },
]

export const APPROVAL_FILTER_OPTIONS: ReadonlyArray<{
  value: Toggle
  label: string
}> = [
  { value: 'on', label: 'Required' },
  { value: 'off', label: 'Not required' },
]

export const USERS_FILTER_WIDTHS = {
  rel: 'w-38',
  sync: 'w-36',
  appr: 'w-38',
} as const

const RELATIONSHIPS = RELATIONSHIP_FILTER_OPTIONS.map(({ value }) => value)

/** Unknown values fall back to the defaults. */
export function parseUsersState(params: URLSearchParams): UsersState {
  const sort = oneOf(params.get('sort'), USERS_SORTABLE)
  const dir = oneOf(params.get('dir'), SORT_DIRECTIONS)
  return {
    q: params.get('q') ?? '',
    rel: oneOf(params.get('rel'), RELATIONSHIPS),
    sync: oneOf(params.get('sync'), TOGGLES),
    appr: oneOf(params.get('appr'), TOGGLES),
    sort: sort ?? DEFAULT_SORT.sort,
    dir: sort === null ? DEFAULT_SORT.dir : (dir ?? 'asc'),
    page: positiveInt(params.get('page')) ?? 1,
  }
}

/** Leaves out every value that equals its default. */
export function serializeUsersState(state: UsersState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q !== '') params.set('q', state.q)
  if (state.rel !== null) params.set('rel', state.rel)
  if (state.sync !== null) params.set('sync', state.sync)
  if (state.appr !== null) params.set('appr', state.appr)
  if (state.sort !== DEFAULT_SORT.sort || state.dir !== DEFAULT_SORT.dir) {
    params.set('sort', state.sort)
    params.set('dir', state.dir)
  }
  if (state.page !== 1) params.set('page', String(state.page))
  return params
}

/** Changes whenever the visible rows could change, which is when a selection stops applying. */
export function selectionScope(state: UsersState): string {
  return serializeUsersState(state).toString()
}

export function withoutFilters(state: UsersState): UsersState {
  return { ...state, q: '', rel: null, sync: null, appr: null, page: 1 }
}

export function hasFilters(state: UsersState): boolean {
  return filterCount(state) > 0 || state.q.trim() !== ''
}

/** Counts the select filters, not the search, for the phone Filters button. */
export function filterCount(state: UsersState): number {
  return [state.rel, state.sync, state.appr].filter((value) => value !== null)
    .length
}
