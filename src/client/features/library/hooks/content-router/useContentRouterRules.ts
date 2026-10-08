import { useState } from 'react'
import { useMinLoading } from '@/hooks/useMinLoading'
import { queryClient } from '@/lib/queryClient'
import {
  $api,
  apiErrorMessage,
  apiFetch,
  mutationErrorMessage,
} from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']
type RouterRulePayload = components['schemas']['RouterRulePayload']
type RulesResponse = components['schemas']['RouterRuleListResponse']

const rulesKey = $api.queryOptions('get', '/v1/content-router/rules').queryKey

function updateCachedRules(update: (rules: RouterRule[]) => RouterRule[]) {
  queryClient.setQueryData<RulesResponse>(rulesKey, (old) =>
    old ? { ...old, rules: update(old.rules) } : old,
  )
}

/** Creates the rule when `id` is null, otherwise replaces it, and writes the result into the rules cache. */
export async function saveRule(
  id: number | null,
  payload: RouterRulePayload,
): Promise<RouterRule> {
  if (id === null) {
    const { data, error } = await apiFetch.POST('/v1/content-router/rules', {
      body: payload,
    })
    if (error) throw error
    updateCachedRules((rules) => [...rules, data.rule])
    return data.rule
  }
  const { data, error } = await apiFetch.PUT('/v1/content-router/rules/{id}', {
    params: { path: { id } },
    body: payload,
  })
  if (error) throw error
  updateCachedRules((rules) =>
    rules.map((rule) => (rule.id === id ? data.rule : rule)),
  )
  return data.rule
}

export async function deleteRule(id: number): Promise<void> {
  const { error } = await apiFetch.DELETE('/v1/content-router/rules/{id}', {
    params: { path: { id } },
  })
  if (error) throw error
  updateCachedRules((rules) => rules.filter((rule) => rule.id !== id))
}

export function useContentRouterRules() {
  const query = useMinLoading($api.useQuery('get', '/v1/content-router/rules'))
  const [toggleErrors, setToggleErrors] = useState<ReadonlyMap<number, string>>(
    new Map(),
  )
  const [toggling, setToggling] = useState<ReadonlySet<number>>(new Set())

  const setToggleError = (id: number, message: string | null) =>
    setToggleErrors((prev) => {
      const next = new Map(prev)
      if (message === null) next.delete(id)
      else next.set(id, message)
      return next
    })

  const setPending = (id: number, pending: boolean) =>
    setToggling((prev) => {
      const next = new Set(prev)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })

  const setEnabled = (id: number, enabled: boolean) =>
    updateCachedRules((rules) =>
      rules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
    )

  const toggle = async (id: number, enabled: boolean) => {
    setToggleError(id, null)
    setPending(id, true)
    setEnabled(id, enabled)
    try {
      const { error } = await apiFetch.PATCH(
        '/v1/content-router/rules/{id}/toggle',
        { params: { path: { id } }, body: { enabled } },
      )
      if (error) throw error
    } catch (error) {
      setEnabled(id, !enabled)
      setToggleError(
        id,
        mutationErrorMessage(
          error,
          `The route could not be turned ${enabled ? 'on' : 'off'}. Try again.`,
        ),
      )
    } finally {
      setPending(id, false)
    }
  }

  const rules = query.data?.rules ?? null

  return {
    rules,
    isLoading: query.isLoading,
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'Routes failed to load.')
      : null,
    retry: () => void query.refetch(),
    toggle,
    toggleError: (id: number) => toggleErrors.get(id) ?? null,
    isToggling: (id: number) => toggling.has(id),
  }
}
