import { useQueries } from '@tanstack/react-query'
import { testConnection } from '@/features/library/hooks/instances/useConnectionTest'
import type { ArrType } from '@/features/library/lib/instances/instance-form'
import type { InstanceHealth } from '@/features/library/lib/instances/instance-summary'
import type { ArrTarget } from '@/lib/approval'
import { CONNECTION_CHECK_STALE_TIME } from '@/lib/constants'
import { queryClient } from '@/lib/queryClient'

function healthKey(type: ArrType, id: number) {
  return ['instance-health', type, id] as const
}

export function invalidateInstanceHealth(type: ArrType, id: number) {
  return queryClient.invalidateQueries({ queryKey: healthKey(type, id) })
}

export function useInstanceHealth(
  type: ArrType,
  targets: readonly ArrTarget[],
) {
  const checks = useQueries({
    queries: targets.map(({ instance }) => ({
      queryKey: healthKey(type, instance.id),
      queryFn: () =>
        testConnection(type, {
          baseUrl: instance.baseUrl,
          apiKey: instance.apiKey,
        }),
      staleTime: CONNECTION_CHECK_STALE_TIME,
      retry: false,
    })),
  })

  return (id: number): InstanceHealth => {
    const check =
      checks[targets.findIndex(({ instance }) => instance.id === id)]
    if (!check || check.isPending) return 'unknown'
    if (check.data?.success) return 'connected'
    return check.data?.code === 'webhook_callback_failed'
      ? 'callback_failed'
      : 'failed'
  }
}
