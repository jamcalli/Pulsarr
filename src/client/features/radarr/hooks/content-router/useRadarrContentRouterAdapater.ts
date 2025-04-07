import { useCallback } from 'react'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

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
