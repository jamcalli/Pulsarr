import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { withMinDuration } from '@/hooks/useMinLoading'
import { mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type SendFailure = { success: false; error: string }

/** A result only holds for the value it tested, so changing the value, or clearing it to null, returns the test to idle. */
export function useSendTest<
  Value,
  Result = components['schemas']['TestResult'],
>(
  send: (value: Value) => Promise<Result>,
  current: Value | null,
  equal: (a: Value, b: Value) => boolean = Object.is,
) {
  const [tested, setTested] = useState<{
    value: Value
    ranAt: number
    outcome: Result | SendFailure
  } | null>(null)
  const mutation = useMutation({
    mutationFn: (value: Value) => withMinDuration(send(value)),
  })

  const run = (value: Value) => {
    mutation.mutate(value, {
      onSuccess: (outcome) => setTested({ value, ranAt: Date.now(), outcome }),
      onError: (error) =>
        setTested({
          value,
          ranAt: Date.now(),
          outcome: {
            success: false,
            error: mutationErrorMessage(
              error,
              'The test did not run. Try again.',
            ),
          },
        }),
    })
  }

  const result =
    tested && current !== null && equal(tested.value, current) ? tested : null

  return {
    testing: mutation.isPending,
    outcome: result?.outcome ?? null,
    ranAt: result?.ranAt ?? null,
    run,
  }
}
