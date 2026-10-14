import type { PageSize } from '@/components/data-table/page-size'
import { useWatchlistView } from '@/features/users/hooks/user/useWatchlistView'
import {
  parseWatchlistState,
  serializeWatchlistState,
  visibleItems,
  type WatchlistState,
  watchlistPageSizePref,
} from '@/features/users/lib/user/watchlist-state'
import { useUrlState } from '@/hooks/useUrlState'
import type { RecentRequest } from '@/lib/media-item'
import { paginate } from '@/lib/paginate'
import { usePref } from '@/lib/prefs'

export function useUserWatchlist(items: readonly RecentRequest[]) {
  const { state, setState, pageHref } = useUrlState(
    parseWatchlistState,
    serializeWatchlistState,
  )
  const [view, setView] = useWatchlistView()
  const [pageSize, savePageSize] = usePref(watchlistPageSizePref)

  const matching = visibleItems(items, state)
  const { page, rows } = paginate(matching, state.page, pageSize)

  return {
    state,
    page,
    pageHref,
    total: matching.length,
    view,
    setView,
    rows: view === 'list' ? rows : matching,
    update: (patch: Partial<Omit<WatchlistState, 'page'>>) =>
      setState({ ...state, page: 1, ...patch }),
    setPage: (next: number) => setState({ ...state, page: next }),
    pageSize,
    setPageSize: (size: PageSize) => {
      savePageSize(size)
      setState({ ...state, page: 1 })
    },
  }
}

export type UserWatchlist = ReturnType<typeof useUserWatchlist>
