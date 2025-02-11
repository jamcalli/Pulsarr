import { useSonarrStore } from '@/stores/sonarrStore'

export function useSonarrGenreRouting() {
  const genreRoutes = useSonarrStore(state => state.genreRoutes)
  const instances = useSonarrStore(state => state.instances)
  const { 
    createGenreRoute, 
    updateGenreRoute, 
    deleteGenreRoute,
    fetchGenreRoutes 
  } = useSonarrStore()

  return {
    genreRoutes,
    instances,
    createGenreRoute,
    updateGenreRoute,
    deleteGenreRoute,
    fetchGenreRoutes
  }
}