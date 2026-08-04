import { useCallback } from 'react'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

/**
 * Content router scoped to Radarr routing rules.
 *
 * @returns The content router methods with a memoized `fetchRules` function.
 */
export function useRadarrContentRouterAdapter() {
  const contentRouter = useContentRouter({ targetType: 'radarr' })

  const fetchRules = useCallback(async () => {
    const result = await contentRouter.fetchRules()
    return result
  }, [contentRouter])

  return {
    ...contentRouter,
    fetchRules,
  }
}
