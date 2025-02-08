import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/context/context'
import { useToast } from '@/hooks/use-toast'
import GenreRouteCard from './sonarr-genre-route-card'
import type { GenreRouteFormValues } from './sonarr-genre-route-card'
import DeleteGenreRouteAlert from './delete-genre-route-alert'

const GenreRoutingSection = () => {
  const {
    instances = [],
    genres = [],
    genreRoutes = [],
    fetchGenres,
    createGenreRoute,
    updateGenreRoute,
    deleteGenreRoute,
  } = useConfig()

  const { toast } = useToast()
  const [savingRoutes, setSavingRoutes] = useState<{ [key: string]: boolean }>(
    {},
  )
  const [localRoutes, setLocalRoutes] = useState<
    Array<{
      tempId: string
      name: string
      genre: string
      sonarrInstanceId: number
      rootFolder: string
    }>
  >([])
  const [deleteConfirmationRouteId, setDeleteConfirmationRouteId] = useState<
    number | null
  >(null)

  const handleAddRoute = () => {
    const defaultInstance = instances[0]
    setLocalRoutes([
      ...localRoutes,
      {
        tempId: `temp-${Date.now()}`,
        name: 'New Genre Route',
        sonarrInstanceId: defaultInstance?.id || 0,
        genre: '',
        rootFolder: '',
      },
    ])
  }

  const handleSaveNewRoute = async (
    tempId: string,
    data: GenreRouteFormValues,
  ) => {
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
  }

  const handleUpdateRoute = async (id: number, data: GenreRouteFormValues) => {
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
  }

  const handleGenreDropdownOpen = async () => {
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
  }

  const handleRemoveRoute = async () => {
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
  }

  return (
    <div className="grid gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text">Genre Routes</h2>
        <Button onClick={handleAddRoute}>Add Route</Button>
      </div>

      <div className="grid gap-4">
        {/* Local (unsaved) routes */}
        {localRoutes.map((route) => (
          <GenreRouteCard
            key={route.tempId}
            route={route}
            isNew={true}
            onSave={(data) => handleSaveNewRoute(route.tempId, data)}
            onCancel={() =>
              setLocalRoutes((prev) =>
                prev.filter((r) => r.tempId !== route.tempId),
              )
            }
            onGenreDropdownOpen={handleGenreDropdownOpen}
            instances={instances}
            genres={genres}
            isSaving={!!savingRoutes[route.tempId]}
          />
        ))}

        {/* Saved routes */}
        {genreRoutes.map((route) => (
          <GenreRouteCard
            key={route.id}
            route={route}
            onSave={(data) => handleUpdateRoute(route.id, data)}
            onCancel={() => null}
            onRemove={() => setDeleteConfirmationRouteId(route.id)}
            onGenreDropdownOpen={handleGenreDropdownOpen}
            instances={instances}
            genres={genres}
            isSaving={!!savingRoutes[route.id]}
          />
        ))}

        {!localRoutes.length && !genreRoutes.length && (
          <div className="text-center py-8 text-text">
            <p>No genre routes configured</p>
            <Button onClick={handleAddRoute} className="mt-4">
              Add Your First Route
            </Button>
          </div>
        )}
      </div>

      <DeleteGenreRouteAlert
        open={deleteConfirmationRouteId !== null}
        onOpenChange={() => setDeleteConfirmationRouteId(null)}
        onConfirm={handleRemoveRoute}
        routeName={
          genreRoutes.find((r) => r.id === deleteConfirmationRouteId)?.name ||
          ''
        }
      />
    </div>
  )
}

export default GenreRoutingSection