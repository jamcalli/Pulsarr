import {
  type MutationState,
  useMutation,
  useMutationState,
} from '@tanstack/react-query'
import { useMinDuration } from '@/hooks/useMinLoading'
import { OPERATION_RESULT_TTL } from '@/lib/constants'
import type { OperationMeta } from '@/lib/operation-toasts'
import { mutationErrorMessage } from '@/lib/tanstackApi'

interface OperationOptions<Variables, Data> {
  key: readonly string[]
  mutationFn: (variables: Variables) => Promise<Data>
  meta: OperationMeta
  errorFallback: string
  onSettled?: () => void
}

interface OperationState<Variables, Data> {
  running: boolean
  errorMessage: string | null
  result: { ranAt: number; data: Data } | null
  run: (variables: Variables) => void
}

/** State is read from the mutation cache, so the latest run survives the page unmounting. */
export function useOperation<Variables = void, Data = never>({
  key,
  mutationFn,
  meta,
  errorFallback,
  onSettled,
}: OperationOptions<Variables, Data>): OperationState<Variables, Data> {
  const mutation = useMutation({
    mutationKey: key,
    mutationFn,
    meta,
    gcTime: OPERATION_RESULT_TTL,
    onSettled,
  })
  const runs = useMutationState<MutationState<Data, Error, Variables>>({
    filters: { mutationKey: key },
    select: (entry) => entry.state,
  })
  const latest = runs.at(-1)
  const running = useMinDuration(latest?.status === 'pending')

  return {
    running,
    errorMessage:
      latest?.status === 'error'
        ? mutationErrorMessage(latest.error, errorFallback)
        : null,
    result:
      latest?.status === 'success' && latest.data !== undefined
        ? { ranAt: latest.submittedAt, data: latest.data }
        : null,
    run: mutation.mutate,
  }
}
