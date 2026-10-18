import { ContentTypeSchema } from '@root/schemas/common/content-type.schema'
import { WatchlistStatusSchema } from '@root/schemas/common/watchlist-status.schema'
import {
  WATCHLIST_EXCLUSION_ITEMS_DEFAULTS,
  WatchlistExclusionFilterSchema,
  WatchlistExclusionItemsQuerySchema,
} from '@root/schemas/watchlist-exclusions/watchlist-exclusions.schema'
import { type PageSize, pageSizePref } from '@/components/data-table/page-size'
import { REQUEST_STATUS_LABELS } from '@/lib/request-labels'
import {
  oneOf,
  positiveInt,
  SORT_DIRECTIONS,
  type SortDirection,
} from '@/lib/url-state'
import type { components, paths } from '@/types/api.js'

type ContentType = components['schemas']['ContentType']
type WatchlistStatus = components['schemas']['WatchlistStatus']
type ExclusionFilter = components['schemas']['WatchlistExclusionFilter']
type ItemsQuery = NonNullable<
  paths['/v1/watchlist-exclusions/items']['get']['parameters']['query']
>

export const EXCLUSIONS_SORTABLE =
  WatchlistExclusionItemsQuerySchema.shape.sortBy.unwrap().options

export type ExclusionsSortKey = (typeof EXCLUSIONS_SORTABLE)[number]

export interface ExclusionsState {
  q: string
  user: number | null
  type: ContentType | null
  status: WatchlistStatus | null
  exclusion: ExclusionFilter | null
  sort: ExclusionsSortKey
  dir: SortDirection
  /** One-based. */
  page: number
}

export const exclusionsPageSizePref = pageSizePref('watchlist-exclusions')

const DEFAULT_SORT = {
  sort: WATCHLIST_EXCLUSION_ITEMS_DEFAULTS.sortBy,
  dir: WATCHLIST_EXCLUSION_ITEMS_DEFAULTS.sortOrder,
} as const satisfies { sort: ExclusionsSortKey; dir: SortDirection }

export const EXCLUSION_FILTER_LABELS: Record<ExclusionFilter, string> = {
  excluded: 'Excluded',
  'not-excluded': 'Not excluded',
  orphan: 'No watchlisters',
}

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: WatchlistStatus
  label: string
}> = WatchlistStatusSchema.options.map((value) => ({
  value,
  label: REQUEST_STATUS_LABELS[value],
}))

export const EXCLUSION_FILTER_OPTIONS: ReadonlyArray<{
  value: ExclusionFilter
  label: string
}> = WatchlistExclusionFilterSchema.options.map((value) => ({
  value,
  label: EXCLUSION_FILTER_LABELS[value],
}))

export const EXCLUSIONS_FILTER_WIDTHS = {
  user: 'w-42',
  type: 'w-38',
  status: 'w-38',
  exclusion: 'w-42',
} as const

/** Unknown values fall back to the defaults. */
export function parseExclusionsState(params: URLSearchParams): ExclusionsState {
  const sort = oneOf(params.get('sort'), EXCLUSIONS_SORTABLE)
  const dir = oneOf(params.get('dir'), SORT_DIRECTIONS)
  return {
    q: params.get('q') ?? '',
    user: positiveInt(params.get('user')),
    type: oneOf(params.get('type'), ContentTypeSchema.options),
    status: oneOf(params.get('status'), WatchlistStatusSchema.options),
    exclusion: oneOf(
      params.get('exclusion'),
      WatchlistExclusionFilterSchema.options,
    ),
    sort: sort ?? DEFAULT_SORT.sort,
    dir: sort === null ? DEFAULT_SORT.dir : (dir ?? 'asc'),
    page: positiveInt(params.get('page')) ?? 1,
  }
}

/** Leaves out every value that equals its default. */
export function serializeExclusionsState(
  state: ExclusionsState,
): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q !== '') params.set('q', state.q)
  if (state.user !== null) params.set('user', String(state.user))
  if (state.type !== null) params.set('type', state.type)
  if (state.status !== null) params.set('status', state.status)
  if (state.exclusion !== null) params.set('exclusion', state.exclusion)
  if (state.sort !== DEFAULT_SORT.sort || state.dir !== DEFAULT_SORT.dir) {
    params.set('sort', state.sort)
    params.set('dir', state.dir)
  }
  if (state.page !== 1) params.set('page', String(state.page))
  return params
}

/** Changes whenever the visible rows could change, which is when an expanded row closes. */
export function expansionScope(
  state: ExclusionsState,
  pageSize: PageSize,
): string {
  return `${serializeExclusionsState(state).toString()}#${pageSize}`
}

/** Also changes when the Maintainerr form turns dirty, since the table freezes and drops its selection then. */
export function selectionScope(
  state: ExclusionsState,
  pageSize: PageSize,
  dirty: boolean,
): string {
  return `${expansionScope(state, pageSize)}#${dirty ? 'dirty' : 'clean'}`
}

export function withoutFilters(state: ExclusionsState): ExclusionsState {
  return {
    ...state,
    q: '',
    user: null,
    type: null,
    status: null,
    exclusion: null,
    page: 1,
  }
}

export function hasFilters(state: ExclusionsState): boolean {
  return filterCount(state) > 0 || state.q.trim() !== ''
}

/** Counts the select filters, not the search, for the phone Filters button. */
export function filterCount(state: ExclusionsState): number {
  return [state.user, state.type, state.status, state.exclusion].filter(
    (value) => value !== null,
  ).length
}

export function toQuery(state: ExclusionsState, pageSize: PageSize) {
  return {
    search: state.q.trim() || undefined,
    userId: state.user ?? undefined,
    type: state.type ?? undefined,
    status: state.status ?? undefined,
    exclusion: state.exclusion ?? undefined,
    sortBy: state.sort,
    sortOrder: state.dir,
    limit: pageSize,
    offset: (state.page - 1) * pageSize,
  } satisfies ItemsQuery
}
