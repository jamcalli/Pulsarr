import type { DashboardStats } from '@/features/home/hooks/useDashboardStats'
import { rankingViewPref } from '@/features/home/lib/home-prefs'
import { usePref } from '@/lib/prefs'

export function usePopularityRankings(stats: DashboardStats) {
  const [view, setView] = usePref(rankingViewPref)
  return { ...stats, view, setView }
}
