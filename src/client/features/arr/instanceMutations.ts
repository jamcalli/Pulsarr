import type { ArrApp } from '@/features/arr/types'
import { queryClient } from '@/lib/queryClient'

export function invalidateArrInstances(app: ArrApp) {
  return queryClient.invalidateQueries({
    queryKey: ['get', `/v1/${app}/instances`],
  })
}

/**
 * Only one instance may be default. Before promoting an instance, demote every
 * other default (clearing its synced instances, which only apply to the
 * default).
 */
export async function clearOtherDefaults<
  I extends { id: number; isDefault: boolean },
>(
  instances: I[],
  id: number,
  makingDefault: boolean | undefined,
  demote: (instance: I) => Promise<void>,
): Promise<void> {
  if (!makingDefault || instances.find((i) => i.id === id)?.isDefault) {
    return
  }
  await Promise.all(
    instances.filter((i) => i.id !== id && i.isDefault).map(demote),
  )
}
