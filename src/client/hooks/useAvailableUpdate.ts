import { $api } from '@/lib/tanstackApi'
import { availableUpdate, updatePollInterval } from '@/lib/update-status'

export function useAvailableUpdate() {
  const query = $api.useQuery(
    'get',
    '/v1/system/update-status',
    {},
    {
      refetchInterval: (q) => updatePollInterval(q.state.data),
      refetchOnWindowFocus: false,
      retry: false,
      meta: { silentRefresh: true },
    },
  )
  return availableUpdate(query.data)
}
