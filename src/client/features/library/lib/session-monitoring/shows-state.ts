import { SonarrRollingMonitoringSchema } from '@root/schemas/sonarr/season-monitoring.schema'
import { type PageSize, pageSizePref } from '@/components/data-table/page-size'
import {
  oneOf,
  positiveInt,
  SORT_DIRECTIONS,
  type SortDirection,
} from '@/lib/url-state'
import type { components } from '@/types/api.js'

type RollingMode = components['schemas']['SonarrRollingMonitoring']

export const SHOWS_SORTABLE = [
  'show',
  'mode',
  'season',
  'viewers',
  'last',
] as const

export type ShowsSortKey = (typeof SHOWS_SORTABLE)[number]
export type ShowStatus = 'active' | 'inactive'

export interface ShowsState {
  q: string
  mode: RollingMode | null
  status: ShowStatus | null
  sort: ShowsSortKey
  dir: SortDirection
  /** One-based. */
  page: number
}

export const rollingShowsPageSizePref = pageSizePref('session-monitoring')

const DEFAULT_SORT = { sort: 'last', dir: 'desc' } as const satisfies {
  sort: ShowsSortKey
  dir: SortDirection
}

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: ShowStatus
  label: string
}> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

export const SHOWS_FILTER_WIDTHS = {
  mode: 'w-52',
  status: 'w-32',
} as const

const STATUSES = STATUS_FILTER_OPTIONS.map(({ value }) => value)

/** Unknown values fall back to the defaults. */
export function parseShowsState(params: URLSearchParams): ShowsState {
  const sort = oneOf(params.get('sort'), SHOWS_SORTABLE)
  const dir = oneOf(params.get('dir'), SORT_DIRECTIONS)
  return {
    q: params.get('q') ?? '',
    mode: oneOf(params.get('mode'), SonarrRollingMonitoringSchema.options),
    status: oneOf(params.get('status'), STATUSES),
    sort: sort ?? DEFAULT_SORT.sort,
    dir: sort === null ? DEFAULT_SORT.dir : (dir ?? 'asc'),
    page: positiveInt(params.get('page')) ?? 1,
  }
}

/** Leaves out every value that equals its default. */
export function serializeShowsState(state: ShowsState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q !== '') params.set('q', state.q)
  if (state.mode !== null) params.set('mode', state.mode)
  if (state.status !== null) params.set('status', state.status)
  if (state.sort !== DEFAULT_SORT.sort || state.dir !== DEFAULT_SORT.dir) {
    params.set('sort', state.sort)
    params.set('dir', state.dir)
  }
  if (state.page !== 1) params.set('page', String(state.page))
  return params
}

/** Changes whenever the visible rows could change, which is when an expanded row closes. */
export function expansionScope(state: ShowsState, pageSize: PageSize): string {
  return `${serializeShowsState(state).toString()}#${pageSize}`
}

export function withoutFilters(state: ShowsState): ShowsState {
  return { ...state, q: '', mode: null, status: null, page: 1 }
}

export function hasFilters(state: ShowsState): boolean {
  return filterCount(state) > 0 || state.q.trim() !== ''
}

/** Counts the select filters, not the search, for the phone Filters button. */
export function filterCount(state: ShowsState): number {
  return [state.mode, state.status].filter((value) => value !== null).length
}
