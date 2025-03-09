import { useRadarrStore } from '@/features/radarr/store/radarrStore'

export function useRadarrGenreRouting() {
  const genreRoutes = useRadarrStore((state) => state.genreRoutes)
  const instances = useRadarrStore((state) => state.instances)
  const {
    createGenreRoute,
    updateGenreRoute,
    deleteGenreRoute,
    fetchGenreRoutes,
  } = useRadarrStore()

  return {
    genreRoutes,
    instances,
    createGenreRoute,
    updateGenreRoute,
    deleteGenreRoute,
    fetchGenreRoutes,
  }
}
