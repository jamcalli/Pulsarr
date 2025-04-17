import { useState, useCallback } from 'react'
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

/**
 * React hook for managing content routing rules for a specified target type.
 *
 * Provides state and operations to fetch, create, update, delete, and toggle routing rules, along with loading and error states. User feedback is handled via toast notifications.
 *
 * @param targetType - The content target type (e.g., "radarr" or "sonarr") whose routing rules are managed.
 * @returns An object with the current rules, loading and error states, and functions to fetch, create, update, delete, and toggle routing rules.
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

        toast({
          title: 'Success',
          description: `${
            rule.target_type.charAt(0).toUpperCase() + rule.target_type.slice(1)
          } routing rule created successfully`,
        })

        return data.rule
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        toast({
          title: 'Error',
          description: `Failed to create routing rule: ${errorMessage}`,
          variant: 'destructive',
        })
        throw err
      }
    },
    [toast],
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

        toast({
          title: 'Success',
          description: 'Routing rule updated successfully',
        })

        return data.rule
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        toast({
          title: 'Error',
          description: `Failed to update routing rule: ${errorMessage}`,
          variant: 'destructive',
        })
        throw err
      }
    },
    [toast],
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
          // Revert the state if the API call fails
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
