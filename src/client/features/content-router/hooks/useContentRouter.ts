import { createContext, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { $api, apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']
type RouterRulePayload = components['schemas']['RouterRulePayload']
type RulesResponse = components['schemas']['RouterRuleListResponse']

export interface UseContentRouterParams {
  targetType: 'radarr' | 'sonarr'
}

export interface ContentRouterContextType {
  contentType: 'radarr' | 'sonarr'
}

export const ContentRouterContext =
  createContext<ContentRouterContextType | null>(null)

/**
 * React hook for managing content routing rules for a specified target type.
 *
 * Rules are served from the shared react-query cache, so navigations with
 * fresh data render instantly while refetches revalidate in the background.
 * Mutations update the cache in place instead of holding parallel state.
 *
 * @param targetType - The content target type whose routing rules are managed (e.g., "radarr" or "sonarr").
 * @returns An object containing the current routing rules, loading and error states, and functions for managing rules.
 */
export function useContentRouter({ targetType }: UseContentRouterParams) {
  const query = useMinLoading(
    $api.useQuery('get', '/v1/content-router/rules/target/{targetType}', {
      params: { path: { targetType } },
    }),
  )

  const rulesQueryKey = $api.queryOptions(
    'get',
    '/v1/content-router/rules/target/{targetType}',
    { params: { path: { targetType } } },
  ).queryKey

  const queryError = query.error

  useEffect(() => {
    if (queryError) {
      toast.error(
        `Failed to fetch ${targetType} routing rules: ${apiErrorMessage(queryError) ?? 'Unknown error'}`,
      )
    }
  }, [queryError, targetType])

  const updateCachedRules = useCallback(
    (updater: (rules: RouterRule[]) => RouterRule[]) => {
      queryClient.setQueryData(
        rulesQueryKey,
        (old: RulesResponse | undefined) =>
          old ? { ...old, rules: updater(old.rules) } : old,
      )
    },
    [rulesQueryKey],
  )

  const createRule = useCallback(
    async (rule: RouterRulePayload) => {
      const { data, error: fetchError } = await apiFetch.POST(
        '/v1/content-router/rules',
        { body: rule },
      )
      if (fetchError) throw fetchError

      updateCachedRules((rules) => [...rules, data.rule])

      return data.rule
    },
    [updateCachedRules],
  )

  const updateRule = useCallback(
    async (id: number, updates: RouterRulePayload) => {
      const { data, error: fetchError } = await apiFetch.PUT(
        '/v1/content-router/rules/{id}',
        {
          params: { path: { id } },
          body: updates,
        },
      )
      if (fetchError) throw fetchError

      updateCachedRules((rules) =>
        rules.map((rule) => (rule.id === id ? data.rule : rule)),
      )

      return data.rule
    },
    [updateCachedRules],
  )

  const deleteRule = useCallback(
    async (id: number) => {
      const { error: fetchError } = await apiFetch.DELETE(
        '/v1/content-router/rules/{id}',
        { params: { path: { id } } },
      )
      if (fetchError) {
        toast.error(
          `Failed to delete routing rule: ${apiErrorMessage(fetchError) ?? 'Unknown error'}`,
        )
        throw fetchError
      }

      updateCachedRules((rules) => rules.filter((rule) => rule.id !== id))

      toast.success('Routing rule deleted successfully')

      return true
    },
    [updateCachedRules],
  )

  const toggleRule = useCallback(
    async (id: number, enabled: boolean) => {
      // Optimistically update the cache first
      updateCachedRules((rules) =>
        rules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
      )

      try {
        const { error: fetchError } = await apiFetch.PATCH(
          '/v1/content-router/rules/{id}/toggle',
          { params: { path: { id } }, body: { enabled } },
        )

        if (fetchError) throw fetchError

        toast.success(
          `Routing rule ${enabled ? 'enabled' : 'disabled'} successfully`,
        )
      } catch (error) {
        // Revert the optimistic update on any failure
        updateCachedRules((rules) =>
          rules.map((rule) =>
            rule.id === id ? { ...rule, enabled: !enabled } : rule,
          ),
        )
        toast.error(
          `Failed to ${enabled ? 'enable' : 'disable'} route. Please try again.`,
        )
        throw error
      }
    },
    [updateCachedRules],
  )

  return {
    rules: query.data?.rules ?? [],
    isLoading: query.isLoading,
    error: queryError ? (apiErrorMessage(queryError) ?? 'Unknown error') : null,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
  }
}
