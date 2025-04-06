import { useCallback } from 'react'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

export function useSonarrContentRouterAdapter() {
  const instances = useSonarrStore((state) => state.instances)
  const genres = useSonarrStore((state) => state.genres)
  const fetchGenres = useSonarrStore((state) => state.fetchGenres)
  const contentRouterInitialized = useSonarrStore(
    (state) => state.contentRouterInitialized,
  )
  const setContentRouterInitialized = useSonarrStore(
    (state) => state.setContentRouterInitialized,
  )

  const contentRouter = useContentRouter({ targetType: 'sonarr' })

  const fetchRules = useCallback(async () => {
    if (contentRouterInitialized) {
      return contentRouter.rules
    }

    const result = await contentRouter.fetchRules()
    setContentRouterInitialized(true)
    return result
  }, [contentRouter, contentRouterInitialized, setContentRouterInitialized])

  return {
    ...contentRouter,
    fetchRules,
    instances,
    genres,
    handleGenreDropdownOpen: fetchGenres,
  }
}
