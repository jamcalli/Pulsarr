import { useCallback } from 'react'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

/**
 * Content router scoped to Sonarr routing rules.
 *
 * @returns The content router methods with a memoized `fetchRules` function.
 */
export function useSonarrContentRouterAdapter() {
  const contentRouter = useContentRouter({ targetType: 'sonarr' })

  const fetchRules = useCallback(async () => {
    const result = await contentRouter.fetchRules()
    return result
  }, [contentRouter])

  return {
    ...contentRouter,
    fetchRules,
  }
}
