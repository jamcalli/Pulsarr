import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { ConnectionTestStatus } from '@/components/connection-test'
import type { ArrType } from '@/features/library/lib/instances/instance-form'
import { withMinDuration } from '@/hooks/useMinLoading'
import { apiFetch, mutationErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type TestResponse = components['schemas']['ArrTestConnectionResponse']

export interface ArrCredentials {
  baseUrl: string
  apiKey: string
}

export async function testConnection(
  type: ArrType,
  body: ArrCredentials,
): Promise<TestResponse> {
  const { data, error } =
    type === 'radarr'
      ? await apiFetch.POST('/v1/radarr/test-connection', { body })
      : await apiFetch.POST('/v1/sonarr/test-connection', { body })
  if (error) throw error
  return data
}

type Outcome =
  | { status: 'passed' }
  | {
      status: 'failed'
      message: string
      code: TestResponse['code']
    }

function sameCredentials(a: ArrCredentials, b: ArrCredentials): boolean {
  return a.baseUrl === b.baseUrl && a.apiKey === b.apiKey
}

/** A result only holds for the credentials it tested, so editing either field returns the test to idle. */
export function useConnectionTest(type: ArrType, current: ArrCredentials) {
  const [tested, setTested] = useState<
    (ArrCredentials & { outcome: Outcome }) | null
  >(null)
  const mutation = useMutation({
    mutationFn: (credentials: ArrCredentials) =>
      withMinDuration(testConnection(type, credentials)),
  })

  const outcome =
    tested && sameCredentials(tested, current) ? tested.outcome : null
  const status: ConnectionTestStatus = mutation.isPending
    ? 'testing'
    : (outcome?.status ?? 'idle')

  const run = (credentials: ArrCredentials) => {
    mutation.mutate(credentials, {
      onSuccess: (data) =>
        setTested({
          ...credentials,
          outcome: data.success
            ? { status: 'passed' }
            : { status: 'failed', message: data.message, code: data.code },
        }),
      onError: (error) =>
        setTested({
          ...credentials,
          outcome: {
            status: 'failed',
            message: mutationErrorMessage(
              error,
              'The connection test did not run. Try again.',
            ),
            code: null,
          },
        }),
    })
  }

  return {
    status,
    failure: outcome?.status === 'failed' ? outcome : null,
    passedCredentials:
      outcome?.status === 'passed' && tested
        ? { baseUrl: tested.baseUrl, apiKey: tested.apiKey }
        : null,
    run,
  }
}
