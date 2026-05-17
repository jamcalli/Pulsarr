import {
  type CreateExclusion,
  type CreateExclusionResponse,
  CreateExclusionResponseSchema,
} from '@root/schemas/exclusions/exclusions.schema'
import { apiClient } from '@/lib/apiClient'
import { queryClient } from '@/lib/queryClient'
import { useAppMutation } from '@/lib/useAppQuery'
import { exclusionKeys } from './useExclusions'

/**
 * Invalidates exclusion caches.
 * Called after mutations that change exclusion state.
 */
function invalidateExclusionCaches() {
  queryClient.invalidateQueries({ queryKey: exclusionKeys.all })
}

/**
 * Mutation hook for creating an exclusion for one or more users.
 *
 * @example
 * ```typescript
 * const { mutateAsync, isPending } = useCreateExclusion()
 * await mutateAsync({ key: 'tt0111161', userIds: [1, 2] })
 * ```
 */
export function useCreateExclusion() {
  return useAppMutation<CreateExclusionResponse, Error, CreateExclusion>({
    mutationFn: (body) =>
      apiClient.post('/v1/exclusions', body, CreateExclusionResponseSchema),
    onSuccess: () => {
      invalidateExclusionCaches()
    },
  })
}

/**
 * Mutation hook for removing a single exclusion by ID.
 *
 * @example
 * ```typescript
 * const { mutateAsync, isPending, variables } = useRemoveExclusion()
 * await mutateAsync(42)
 * // For per-row state, compare `variables === row.id` with `isPending`.
 * ```
 */
export function useRemoveExclusion() {
  return useAppMutation<void, Error, number>({
    mutationFn: (id) => apiClient.delete<void>(`/v1/exclusions/${id}`),
    onSuccess: () => {
      invalidateExclusionCaches()
    },
  })
}
