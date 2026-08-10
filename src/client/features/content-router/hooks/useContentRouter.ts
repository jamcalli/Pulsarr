import { createContext, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage, apiFetch } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']
type RouterRulePayload = components['schemas']['RouterRulePayload']

export interface UseContentRouterParams {
  targetType: 'radarr' | 'sonarr'
}

// Create a context for the current content router target type
export interface ContentRouterContextType {
  contentType: 'radarr' | 'sonarr'
}

export const ContentRouterContext =
  createContext<ContentRouterContextType | null>(null)

/**
 * React hook for managing content routing rules for a specified target type.
 *
 * Provides state and functions to fetch, create, update, delete, and toggle routing rules, along with loading and error indicators.
 *
 * @param targetType - The content target type whose routing rules are managed (e.g., "radarr" or "sonarr").
 * @returns An object containing the current routing rules, loading and error states, and functions for managing rules.
 */
export function useContentRouter({ targetType }: UseContentRouterParams) {
  const [isLoading, setIsLoading] = useState(false)
  const [rules, setRules] = useState<RouterRule[]>([])
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch all rules for the specified target type
   */
  const fetchRules = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await apiFetch.GET(
        '/v1/content-router/rules/target/{targetType}',
        { params: { path: { targetType } } },
      )
      if (fetchError) throw fetchError

      setRules(data.rules)

      // If rules exist, keep loading state for minimum duration
      if (data.rules.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      return data.rules
    } catch (err) {
      const errorMessage = apiErrorMessage(err) ?? 'Unknown error'
      setError(errorMessage)
      toast.error(
        `Failed to fetch ${targetType} routing rules: ${errorMessage}`,
      )
      return []
    } finally {
      setIsLoading(false)
    }
  }, [targetType])

  /**
   * Create a new routing rule
   */
  const createRule = useCallback(async (rule: RouterRulePayload) => {
    setError(null)

    try {
      const { data, error: fetchError } = await apiFetch.POST(
        '/v1/content-router/rules',
        { body: rule },
      )
      if (fetchError) throw fetchError

      // Update rules state with the new rule
      setRules((prevRules) => [...prevRules, data.rule])

      return data.rule
    } catch (err) {
      const errorMessage = apiErrorMessage(err) ?? 'Unknown error'
      setError(errorMessage)
      throw err
    }
  }, [])

  /**
   * Update an existing routing rule
   */
  const updateRule = useCallback(
    async (id: number, updates: RouterRulePayload) => {
      setError(null)

      try {
        const { data, error: fetchError } = await apiFetch.PUT(
          '/v1/content-router/rules/{id}',
          {
            params: { path: { id } },
            body: updates,
          },
        )
        if (fetchError) throw fetchError

        // Update the rule in the local state
        setRules((prevRules) =>
          prevRules.map((rule) => (rule.id === id ? data.rule : rule)),
        )

        return data.rule
      } catch (err) {
        const errorMessage = apiErrorMessage(err) ?? 'Unknown error'
        setError(errorMessage)
        throw err
      }
    },
    [],
  )

  /**
   * Delete a routing rule
   */
  const deleteRule = useCallback(async (id: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const { error: fetchError } = await apiFetch.DELETE(
        '/v1/content-router/rules/{id}',
        { params: { path: { id } } },
      )
      if (fetchError) throw fetchError

      // Update local state
      setRules((prevRules) => prevRules.filter((rule) => rule.id !== id))

      toast.success('Routing rule deleted successfully')

      return true
    } catch (err) {
      const errorMessage = apiErrorMessage(err) ?? 'Unknown error'
      setError(errorMessage)
      toast.error(`Failed to delete routing rule: ${errorMessage}`)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Toggle rule enabled state
   */
  const toggleRule = useCallback(async (id: number, enabled: boolean) => {
    try {
      // Optimistically update the local state first
      setRules((prevRules) =>
        prevRules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
      )

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
      setRules((prevRules) =>
        prevRules.map((rule) =>
          rule.id === id ? { ...rule, enabled: !enabled } : rule,
        ),
      )
      toast.error(
        `Failed to ${enabled ? 'enable' : 'disable'} route. Please try again.`,
      )
      throw error
    }
  }, [])

  return {
    rules,
    isLoading,
    error,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
  }
}
