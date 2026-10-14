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
import { usePref } from '@/lib/prefs'

export function useUserWatchlist(items: readonly RecentRequest[]) {
  const { state, setState, pageHref } = useUrlState(
    parseWatchlistState,
    serializeWatchlistState,
  )
  const [view, setView] = useWatchlistView()
  const [pageSize, savePageSize] = usePref(watchlistPageSizePref)

  const matching = visibleItems(items, state)
  const lastPage = Math.max(1, Math.ceil(matching.length / pageSize))
  const page = Math.min(state.page, lastPage)

  return {
    state,
    page,
    pageHref,
    total: matching.length,
    view,
    setView,
    rows:
      view === 'list'
        ? matching.slice((page - 1) * pageSize, page * pageSize)
        : matching,
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
