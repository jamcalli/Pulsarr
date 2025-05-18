import { useState, useCallback, createContext } from 'react'
import { useToast } from '@/hooks/use-toast'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
  ContentRouterRuleResponse,
  ContentRouterRuleListResponse,
  ContentRouterRuleToggle,
} from '@root/schemas/content-router/content-router.schema'

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
 * React hook for managing content routing rules for a given target type.
 *
 * Exposes state and functions to fetch, create, update, delete, and toggle routing rules, along with loading and error indicators.
 *
 * @param targetType - The content target type whose routing rules are managed (e.g., "radarr" or "sonarr").
 * @returns An object containing the current routing rules, loading and error states, and functions for rule management.
 */
export function useContentRouter({ targetType }: UseContentRouterParams) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [rules, setRules] = useState<ContentRouterRule[]>([])
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch all rules for the specified target type
   */
  const fetchRules = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/v1/content-router/rules/target/${targetType}`,
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch ${targetType} routing rules`)
      }

      const data = (await response.json()) as ContentRouterRuleListResponse

      setRules(data.rules)

      // If rules exist, keep loading state for minimum duration
      if (data.rules.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      return data.rules
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      toast({
        title: 'Error',
        description: `Failed to fetch ${targetType} routing rules: ${errorMessage}`,
        variant: 'destructive',
      })
      return []
    } finally {
      setIsLoading(false)
    }
  }, [targetType, toast])

  /**
   * Create a new routing rule
   */
  const createRule = useCallback(
    async (
      rule: Omit<ContentRouterRule, 'id' | 'created_at' | 'updated_at'>,
    ) => {
      setError(null)

      try {
        const response = await fetch('/v1/content-router/rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(rule),
        })

        if (!response.ok) {
          throw new Error('Failed to create routing rule')
        }

        const data = (await response.json()) as ContentRouterRuleResponse

        // Update rules state with the new rule
        setRules((prevRules) => [...prevRules, data.rule])

        return data.rule
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        throw err
      }
    },
    [],
  )

  /**
   * Update an existing routing rule
   */
  const updateRule = useCallback(
    async (id: number, updates: ContentRouterRuleUpdate) => {
      setError(null)

      try {
        const response = await fetch(`/v1/content-router/rules/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          throw new Error('Failed to update routing rule')
        }

        const data = (await response.json()) as ContentRouterRuleResponse

        // Update the rule in the local state
        setRules((prevRules) =>
          prevRules.map((rule) => (rule.id === id ? data.rule : rule)),
        )

        return data.rule
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        throw err
      }
    },
    [],
  )

  /**
   * Delete a routing rule
   */
  const deleteRule = useCallback(
    async (id: number) => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/v1/content-router/rules/${id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete routing rule')
        }

        // Update local state
        setRules((prevRules) => prevRules.filter((rule) => rule.id !== id))

        toast({
          title: 'Success',
          description: 'Routing rule deleted successfully',
        })

        return true
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        toast({
          title: 'Error',
          description: `Failed to delete routing rule: ${errorMessage}`,
          variant: 'destructive',
        })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [toast],
  )

  /**
   * Toggle rule enabled state
   */
  const toggleRule = useCallback(
    async (id: number, enabled: boolean) => {
      try {
        // Optimistically update the local state first
        setRules((prevRules) =>
          prevRules.map((rule) =>
            rule.id === id ? { ...rule, enabled } : rule,
          ),
        )

        const toggleData: ContentRouterRuleToggle = { enabled }
        const response = await fetch(`/v1/content-router/rules/${id}/toggle`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(toggleData),
        })

        if (!response.ok) {
          // Revert on non-2xx status
          setRules((prevRules) =>
            prevRules.map((rule) =>
              rule.id === id ? { ...rule, enabled: !enabled } : rule,
            ),
          )
          throw new Error('Failed to toggle routing rule')
        }

        toast({
          title: 'Success',
          description: `Routing rule ${enabled ? 'enabled' : 'disabled'} successfully`,
        })
      } catch (error) {
        // Revert on network / runtime error as well
        setRules((prevRules) =>
          prevRules.map((rule) =>
            rule.id === id ? { ...rule, enabled: !enabled } : rule,
          ),
        )
        toast({
          title: 'Error',
          description: `Failed to ${enabled ? 'enable' : 'disable'} route. Please try again.`,
          variant: 'destructive',
        })
        throw error
      }
    },
    [toast],
  )

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
