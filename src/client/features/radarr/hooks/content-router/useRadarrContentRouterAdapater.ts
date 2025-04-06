import { useCallback } from 'react'
import { useRadarrStore } from '@/features/radarr/store/radarrStore'
import { useContentRouter } from '@/features/content-router/hooks/useContentRouter'

export function useRadarrContentRouterAdapter() {
  const instances = useRadarrStore((state) => state.instances)
  const genres = useRadarrStore((state) => state.genres)
  const fetchGenres = useRadarrStore((state) => state.fetchGenres)
  const contentRouterInitialized = useRadarrStore((state) => state.contentRouterInitialized)
  const setContentRouterInitialized = useRadarrStore((state) => state.setContentRouterInitialized)

  const contentRouter = useContentRouter({ targetType: 'radarr' })

  const fetchRules = useCallback(async () => {
    if (contentRouterInitialized) {
      return contentRouter.rules;
    }
    
    const result = await contentRouter.fetchRules();
    setContentRouterInitialized(true);
    return result;
  }, [contentRouter, contentRouterInitialized, setContentRouterInitialized]);

  return {
    ...contentRouter,
    fetchRules,
    instances,
    genres,
    handleGenreDropdownOpen: fetchGenres,
  }
}
