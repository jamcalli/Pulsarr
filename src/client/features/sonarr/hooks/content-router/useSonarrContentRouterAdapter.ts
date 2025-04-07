import { useCallback } from 'react'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

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
