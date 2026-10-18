import { keepPreviousData } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  groupRollingShows,
  inactiveShowKeys,
  isInactive,
  type RollingShowRow,
} from '@/features/library/lib/session-monitoring/rolling-shows'
import { invalidateRollingShows } from '@/features/library/lib/session-monitoring/session-monitoring-queries'
import { useArrInstances } from '@/hooks/useArrInstances'
import { $api, apiErrorMessage, isSettled } from '@/lib/tanstackApi'

/** `inactivityDays` is the saved setting, or null until the config has loaded. */
export function useRollingShows(inactivityDays: number | null) {
  const rolling = $api.useQuery(
    'get',
    '/v1/session-monitoring/rolling-monitored',
  )
  const inactive = $api.useQuery(
    'get',
    '/v1/session-monitoring/rolling-monitored/inactive',
    { params: { query: { inactivityDays: inactivityDays ?? undefined } } },
    { enabled: inactivityDays !== null, placeholderData: keepPreviousData },
  )
  const instances = useArrInstances('sonarr')

  const { targets } = instances
  const rows = useMemo<RollingShowRow[] | null>(() => {
    if (!rolling.data || !inactive.data) return null
    const inactiveKeys = inactiveShowKeys(inactive.data.shows)
    return groupRollingShows(rolling.data.shows).map((show) => ({
      ...show,
      instanceName:
        targets.find(
          ({ instance }) => instance.id === show.record.sonarr_instance_id,
        )?.instance.name ?? '',
      inactive: isInactive(show, inactiveKeys),
    }))
  }, [rolling.data, inactive.data, targets])

  const failed = [rolling, inactive].find((query) => query.isError)?.error

  return {
    rows,
    isReady:
      isSettled(rolling) &&
      isSettled(inactive) &&
      (instances.hasData || instances.errorMessage !== null),
    errorMessage:
      failed !== undefined
        ? (apiErrorMessage(failed) ?? "Couldn't load session monitoring.")
        : instances.errorMessage,
    retry: () => {
      void invalidateRollingShows()
      if (instances.errorMessage) instances.retry()
    },
  }
}
