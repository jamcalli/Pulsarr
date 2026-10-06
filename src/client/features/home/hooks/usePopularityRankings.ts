import type { DashboardStats } from '@/features/home/hooks/useDashboardStats'
import { useMediaView } from '@/features/home/hooks/useMediaView'
import { rankingViewPref } from '@/features/home/lib/home-prefs'

export function usePopularityRankings(stats: DashboardStats) {
  const [view, setView] = useMediaView(rankingViewPref)
  return { ...stats, view, setView }
}
