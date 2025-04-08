import { useCallback } from 'react'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

/**
 * Integrates Sonarr store state with content routing functionalities.
 *
 * This custom hook combines data from the Sonarr store (such as instances and genres) with
 * content routing methods provided by a content router targeted for Sonarr. It memoizes a function
 * to asynchronously fetch routing rules and exposes a method to trigger genre fetching.
 *
 * @returns An object containing:
 *   - All properties and methods from the Sonarr content router.
 *   - A memoized `fetchRules` function to retrieve routing rules.
 *   - The store's `instances` and `genres`.
 *   - A `handleGenreDropdownOpen` method that triggers genre fetching.
 */
export function useSonarrContentRouterAdapter() {
  const instances = useSonarrStore((state) => state.instances)
  const genres = useSonarrStore((state) => state.genres)
  const fetchGenres = useSonarrStore((state) => state.fetchGenres)
  const contentRouter = useContentRouter({ targetType: 'sonarr' })

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
