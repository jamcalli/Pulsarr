import type { ConnectionTestStatus } from '@/components/connection-test'
import { useSendTest } from '@/hooks/useSendTest'
import type { ArrType } from '@/lib/arr/instance-form'
import { apiFetch } from '@/lib/tanstackApi'
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

function sameCredentials(a: ArrCredentials, b: ArrCredentials): boolean {
  return a.baseUrl === b.baseUrl && a.apiKey === b.apiKey
}

export function useConnectionTest(type: ArrType, current: ArrCredentials) {
  const test = useSendTest(
    (credentials: ArrCredentials) => testConnection(type, credentials),
    current,
    sameCredentials,
  )
  const outcome = test.outcome
  const status: ConnectionTestStatus = test.testing
    ? 'testing'
    : outcome === null
      ? 'idle'
      : outcome.success
        ? 'passed'
        : 'failed'
  const failure =
    outcome === null || outcome.success
      ? null
      : 'error' in outcome
        ? { message: outcome.error, code: null }
        : { message: outcome.message, code: outcome.code }

  return {
    status,
    failure,
    passedCredentials:
      outcome?.success === true
        ? { baseUrl: current.baseUrl, apiKey: current.apiKey }
        : null,
    run: test.run,
  }
}
