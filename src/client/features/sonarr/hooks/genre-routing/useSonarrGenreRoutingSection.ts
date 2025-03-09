import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useSonarrGenreRouting } from '@/features/sonarr/hooks/genre-routing/useSonarrGenreRouting'
import type { GenreRouteFormValues } from '@/features/sonarr/store/schemas'
import type { TempRoute } from '@/features/sonarr/store/types'

export function useSonarrGenreRoutingSection() {
  const { toast } = useToast()
  const instances = useSonarrStore((state) => state.instances)
  const genres = useSonarrStore((state) => state.genres)
  const fetchGenres = useSonarrStore((state) => state.fetchGenres)

  const { genreRoutes, createGenreRoute, updateGenreRoute, deleteGenreRoute } =
    useSonarrGenreRouting()

  const [savingRoutes, setSavingRoutes] = useState<{ [key: string]: boolean }>(
    {},
  )
  const [localRoutes, setLocalRoutes] = useState<TempRoute[]>([])
  const [deleteConfirmationRouteId, setDeleteConfirmationRouteId] = useState<
    number | null
  >(null)

  const handleAddRoute = useCallback(() => {
    const defaultInstance = instances[0]
    setLocalRoutes((prev) => [
      ...prev,
      {
        tempId: `temp-${Date.now()}`,
        name: 'New Genre Route',
        sonarrInstanceId: defaultInstance?.id || 0,
        genre: '',
        rootFolder: '',
        qualityProfile: '',
      },
    ])
  }, [instances])

  const handleSaveNewRoute = useCallback(
    async (tempId: string, data: GenreRouteFormValues) => {
      setSavingRoutes((prev) => ({ ...prev, [tempId]: true }))
      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        await Promise.all([createGenreRoute(data), minimumLoadingTime])
        setLocalRoutes((prev) => prev.filter((r) => r.tempId !== tempId))
        toast({
          title: 'Success',
          description: 'Genre route created',
        })
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to create genre route',
          variant: 'destructive',
        })
      } finally {
        setSavingRoutes((prev) => {
          const updated = { ...prev }
          delete updated[tempId]
          return updated
        })
      }
    },
    [createGenreRoute, toast],
  )

  const handleUpdateRoute = useCallback(
    async (id: number, data: GenreRouteFormValues) => {
      setSavingRoutes((prev) => ({ ...prev, [id]: true }))
      try {
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, 500),
        )
        await Promise.all([updateGenreRoute(id, data), minimumLoadingTime])
        toast({
          title: 'Success',
          description: 'Genre route updated',
        })
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to update genre route',
          variant: 'destructive',
        })
      } finally {
        setSavingRoutes((prev) => {
          const updated = { ...prev }
          delete updated[id]
          return updated
        })
      }
    },
    [updateGenreRoute, toast],
  )

  const handleGenreDropdownOpen = useCallback(async () => {
    if (!genres?.length) {
      try {
        await fetchGenres()
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to fetch genres',
          variant: 'destructive',
        })
      }
    }
  }, [genres, fetchGenres, toast])

  const handleRemoveRoute = useCallback(async () => {
    if (deleteConfirmationRouteId !== null) {
      try {
        await deleteGenreRoute(deleteConfirmationRouteId)
        setDeleteConfirmationRouteId(null)
        toast({
          title: 'Success',
          description: 'Genre route removed',
        })
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to remove genre route',
          variant: 'destructive',
        })
      }
    }
  }, [deleteConfirmationRouteId, deleteGenreRoute, toast])

  const handleCancelLocalRoute = useCallback((tempId: string) => {
    setLocalRoutes((prev) => prev.filter((r) => r.tempId !== tempId))
  }, [])

  return {
    // State
    instances,
    genres,
    genreRoutes,
    localRoutes,
    savingRoutes,
    deleteConfirmationRouteId,

    // Actions
    handleAddRoute,
    handleSaveNewRoute,
    handleUpdateRoute,
    handleGenreDropdownOpen,
    handleRemoveRoute,
    handleCancelLocalRoute,
    setDeleteConfirmationRouteId,
  }
}
