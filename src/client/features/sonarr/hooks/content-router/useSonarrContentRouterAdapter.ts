import { useCallback } from 'react'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

/**
 * A custom React hook that integrates Sonarr store state with content routing functionality.
 *
 * This hook retrieves Sonarr instances and genres from the store and obtains a content router
 * specifically configured for Sonarr. It returns an object that includes all properties and methods
 * from the content router, along with a memoized function to asynchronously fetch routing rules, the
 * current store instances and genres, and a method to handle opening the genre dropdown by fetching genres.
 *
 * @returns An object combining content router methods with Sonarr store data and additional utility functions.
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
