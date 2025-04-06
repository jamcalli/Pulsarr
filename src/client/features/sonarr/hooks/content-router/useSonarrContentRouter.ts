import { useCallback } from 'react'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

export function useSonarrContentRouterAdapter() {
  const instances = useSonarrStore((state) => state.instances)
  const genres = useSonarrStore((state) => state.genres)
  const fetchGenres = useSonarrStore((state) => state.fetchGenres)

  const contentRouter = useContentRouter({ targetType: 'sonarr' })

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
