import { useCallback } from 'react'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

export function useRadarrContentRouterAdapter() {
  const instances = useRadarrStore((state) => state.instances)
  const genres = useRadarrStore((state) => state.genres)
  const fetchGenres = useRadarrStore((state) => state.fetchGenres)

  const contentRouter = useContentRouter({ targetType: 'radarr' })

  const handleGenreDropdownOpen = useCallback(async () => {
    if (!genres?.length) {
      try {
        await fetchGenres()
      } catch (error) {
        console.error('Failed to fetch genres:', error)
      }
    }
  }, [genres, fetchGenres])

  return {
    ...contentRouter,
    instances,
    genres,
    handleGenreDropdownOpen,
  }
}
