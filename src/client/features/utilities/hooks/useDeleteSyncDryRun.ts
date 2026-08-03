import type { DeleteSyncResult } from '@root/schemas/scheduler/scheduler.schema'
import { useMutation, useMutationState } from '@tanstack/react-query'
import { apiFetch } from '@/lib/tanstackApi'
import { useMinLoadingMutation, withMinDuration } from '@/lib/useMinLoading'

const dryRunMutationKey = ['delete-sync-dry-run'] as const

export function useRunDeleteSyncDryRun() {
  return useMinLoadingMutation(
    useMutation({
      mutationKey: dryRunMutationKey,
      mutationFn: async () => {
        const { data, error } = await withMinDuration(
          apiFetch.POST('/v1/scheduler/schedules/delete-sync/dry-run'),
        )
        if (error) throw error
        return data.results
      },
    }),
  )
}

/**
 * Reads the dry run's status and results from anywhere in the tree. The run
 * is triggered in useDeleteSyncActions while the results modal renders
 * elsewhere, so state is shared through the mutation cache by key.
 */
export function useDeleteSyncDryRunState() {
  const states = useMutationState({
    filters: { mutationKey: dryRunMutationKey },
    select: (mutation) => ({
      status: mutation.state.status,
      results: (mutation.state.data as DeleteSyncResult | undefined) ?? null,
    }),
  })
  const latest = states.at(-1)
  return {
    isRunning: latest?.status === 'pending',
    results: latest?.results ?? null,
  }
}
