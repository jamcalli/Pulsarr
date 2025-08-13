import { useCallback } from 'react'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'

/**
 * Custom hook that integrates the Radarr store state with a Radarr-specific content router.
 *
 * Retrieves Radarr instances and genres from the store, initializes a content router with the target type "radarr",
 * and provides a memoized asynchronous function to fetch routing rules. Also exposes a handler to trigger genre fetching.
 *
 * @returns An object combining content router methods with:
 *  - fetchRules: An async function that retrieves routing rules.
 *  - instances: The Radarr instances from the store.
 *  - genres: The genre data from the store.
 *  - handleGenreDropdownOpen: A callback to initiate genre fetching.
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
