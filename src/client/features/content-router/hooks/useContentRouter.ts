import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
  ContentRouterRuleResponse,
  ContentRouterRuleListResponse,
} from '@root/schemas/content-router/content-router.schema'

export interface UseContentRouterParams {
  targetType: 'radarr' | 'sonarr'
}

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
    // Implement minimum loading time of 500ms
    const minimumLoadingTime = new Promise((resolve) =>
      setTimeout(resolve, 500)
    )
    
    const [response] = await Promise.all([
      fetch(`/v1/content-router/rules/target/${targetType}`),
      minimumLoadingTime
    ])

    if (!response.ok) {
      throw new Error(`Failed to fetch ${targetType} routing rules`)
    }

    const data = (await response.json()) as ContentRouterRuleListResponse
    
    setRules(data.rules)
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
    async (rule: Omit<ContentRouterRule, 'id' | 'created_at' | 'updated_at'>) => {
      setIsLoading(true)
      setError(null)
  
      try {
        // Implement minimum loading time
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500)
        )
  
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
        
        // Wait for both operations to complete
        await minimumLoadingTime
        
        // Update local state
        setRules((prevRules) => [...prevRules, data.rule])
  
        toast({
          title: 'Success',
          description: `${
            rule.type.charAt(0).toUpperCase() + rule.type.slice(1)
          } routing rule created successfully`,
        })
  
        return data.rule
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        toast({
          title: 'Error',
          description: `Failed to create routing rule: ${errorMessage}`,
          variant: 'destructive',
        })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [toast]
  )

  /**
   * Update an existing routing rule
   */
  const updateRule = useCallback(
    async (id: number, updates: ContentRouterRuleUpdate) => {
      setIsLoading(true)
      setError(null)
  
      try {
        // Implement minimum loading time
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500)
        )
  
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
        
        // Wait for both operations to complete
        await minimumLoadingTime
  
        // Update local state
        setRules((prevRules) =>
          prevRules.map((rule) => (rule.id === id ? data.rule : rule))
        )
  
        toast({
          title: 'Success',
          description: 'Routing rule updated successfully',
        })
  
        return data.rule
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        toast({
          title: 'Error',
          description: `Failed to update routing rule: ${errorMessage}`,
          variant: 'destructive',
        })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [toast]
  )

  /**
   * Delete a routing rule
   */
  const deleteRule = useCallback(
    async (id: number) => {
      setIsLoading(true)
      setError(null)
  
      try {
        // Implement minimum loading time
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500)
        )
  
        const response = await fetch(`/v1/content-router/rules/${id}`, {
          method: 'DELETE',
        })
  
        if (!response.ok) {
          throw new Error('Failed to delete routing rule')
        }
        
        // Wait for minimum loading time to complete
        await minimumLoadingTime
  
        // Update local state
        setRules((prevRules) => prevRules.filter((rule) => rule.id !== id))
  
        toast({
          title: 'Success',
          description: 'Routing rule deleted successfully',
        })
  
        return true
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
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
    [toast]
  )

  /**
   * Toggle rule enabled state
   */
  const toggleRule = useCallback(
    async (id: number, enabled: boolean) => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/v1/content-router/rules/${id}/toggle`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled }),
        })

        if (!response.ok) {
          throw new Error('Failed to toggle routing rule')
        }

        // Update local state
        setRules((prevRules) =>
          prevRules.map((rule) =>
            rule.id === id ? { ...rule, enabled } : rule,
          ),
        )

        toast({
          title: 'Success',
          description: `Routing rule ${enabled ? 'enabled' : 'disabled'} successfully`,
        })

        return true
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        toast({
          title: 'Error',
          description: `Failed to toggle routing rule: ${errorMessage}`,
          variant: 'destructive',
        })
        throw err
      } finally {
        setIsLoading(false)
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
