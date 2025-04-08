import { useCallback } from 'react'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

/**
 * Custom hook that integrates Radarr store state with Radarr-specific content router functionalities.
 *
 * This hook retrieves Radarr instances and genres from the store, sets up a content router configured for Radarr,
 * and provides a memoized asynchronous function to fetch routing rules. It also returns a handler to trigger fetching genres.
 *
 * @returns An object that spreads content router methods and includes:
 *  - fetchRules: An async function that retrieves routing rules.
 *  - instances: The Radarr instances from the store.
 *  - genres: The genre data from the store.
 *  - handleGenreDropdownOpen: A function to initiate fetching genres.
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
