import { useRadarrStore } from '@/stores/radarrStore'

export function useRadarrGenreRouting() {
  const genreRoutes = useRadarrStore(state => state.genreRoutes)
  const instances = useRadarrStore(state => state.instances)
  const { 
    createGenreRoute, 
    updateGenreRoute, 
    deleteGenreRoute,
    fetchGenreRoutes 
  } = useRadarrStore()

  return {
    genreRoutes,
    instances,
    createGenreRoute,
    updateGenreRoute,
    deleteGenreRoute,
    fetchGenreRoutes
  }
}