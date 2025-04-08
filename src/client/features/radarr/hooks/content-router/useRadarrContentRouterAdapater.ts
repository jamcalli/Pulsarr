import { useCallback } from 'react'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

/**
 * Custom React hook that combines Radarr store data with content routing functionality.
 *
 * This hook retrieves Radarr instances, genres, and a function to fetch genres from the Radarr store. It also initializes a content router for Radarr and provides a memoized fetchRules function that wraps the content router's fetchRules method. The returned object merges the content router's properties with Radarr-specific data and a handler for opening the genre dropdown.
 *
 * @returns An object containing:
 *  - All properties from the Radarr-configured content router.
 *  - A memoized fetchRules function.
 *  - Radarr instances and genres.
 *  - A handleGenreDropdownOpen function to invoke fetching genres.
 */
export function useRadarrContentRouterAdapter() {
  const instances = useRadarrStore((state) => state.instances)
  const genres = useRadarrStore((state) => state.genres)
  const fetchGenres = useRadarrStore((state) => state.fetchGenres)
  const contentRouter = useContentRouter({ targetType: 'radarr' })

  const fetchRules = useCallback(async () => {
    const result = await contentRouter.fetchRules()
    return result
  }, [contentRouter])

  return {
    ...contentRouter,
    fetchRules,
    instances,
    genres,
    handleGenreDropdownOpen: fetchGenres,
  }
}
