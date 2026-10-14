import { RecentRequestStatusSchema } from '@root/schemas/shared/recent-request.schema'
import type { RecentRequest } from '@/lib/media-item'
import { type PrefDef, parseOneOf } from '@/lib/prefs'
import { MEDIA_VIEWS, type MediaView } from '@/lib/request-list-prefs'
import { oneOf, positiveInt } from '@/lib/url-state'

type RequestStatus = RecentRequest['status']

export interface WatchlistState {
  q: string
  status: RequestStatus | null
  /** One-based. */
  page: number
}

export const watchlistViewPref: PrefDef<MediaView> = {
  key: 'pulsarr-user-watchlist-view',
  fallback: 'list',
  parse: parseOneOf(MEDIA_VIEWS),
  serialize: (value) => value,
}

/** Unknown values fall back to the defaults. */
export function parseWatchlistState(params: URLSearchParams): WatchlistState {
  return {
    q: params.get('q') ?? '',
    status: oneOf(params.get('status'), RecentRequestStatusSchema.options),
    page: positiveInt(params.get('page')) ?? 1,
  }
}

/** Leaves out every value that equals its default. */
export function serializeWatchlistState(
  state: WatchlistState,
): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q !== '') params.set('q', state.q)
  if (state.status !== null) params.set('status', state.status)
  if (state.page !== 1) params.set('page', String(state.page))
  return params
}

/** Newest first, narrowed by title and status. */
export function visibleItems(
  items: readonly RecentRequest[],
  { q, status }: WatchlistState,
): RecentRequest[] {
  const needle = q.trim().toLowerCase()
  return items
    .filter(
      (item) =>
        (status === null || item.status === status) &&
        (needle === '' || item.title.toLowerCase().includes(needle)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
