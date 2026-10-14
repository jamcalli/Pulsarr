import { invalidateRollingShows } from '@/features/library/lib/session-monitoring/session-monitoring-queries'
import { withMinDuration } from '@/hooks/useMinLoading'
import { useOperation } from '@/hooks/useOperation'
import { NAV_PAGES } from '@/lib/navigation'
import { apiFetch, requireSuccess } from '@/lib/tanstackApi'

export function useCheckSessions() {
  return useOperation({
    key: ['session-monitoring', 'run'],
    mutationFn: async () => {
      const { data, error } = await withMinDuration(
        apiFetch.POST('/v1/session-monitoring/run'),
      )
      if (error) throw error
      return requireSuccess(data).result
    },
    meta: { label: 'Session check', page: NAV_PAGES.sessionMonitoring },
    errorFallback: 'Sessions were not checked. Try again.',
    onSettled: () => void invalidateRollingShows(),
  })
}
