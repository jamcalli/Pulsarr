import { sessionMonitoringKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'

export function invalidateRollingShows() {
  return Promise.all(
    [sessionMonitoringKeys.rolling, sessionMonitoringKeys.inactive].map(
      (queryKey) => queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

export function invalidateEnrollment() {
  return Promise.all([
    invalidateRollingShows(),
    queryClient.invalidateQueries({
      queryKey: sessionMonitoringKeys.enrollable,
    }),
  ])
}
