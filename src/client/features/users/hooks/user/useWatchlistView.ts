import { watchlistViewPref } from '@/features/users/lib/user/watchlist-state'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePref } from '@/lib/prefs'
import type { MediaView } from '@/lib/request-list-prefs'

/** Phones always get the list, since the view toggle is hidden there. */
export function useWatchlistView(): [MediaView, (view: MediaView) => void] {
  const [saved, setView] = usePref(watchlistViewPref)
  const isMobile = useIsMobile()
  return [isMobile ? 'list' : saved, setView]
}
