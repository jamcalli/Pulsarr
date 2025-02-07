import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useConfig } from '@/context/context'
import { useToast } from '@/hooks/use-toast'
import GenreRouteCard from './sonarr-genre-route-card'
import type { GenreRouteFormValues } from './sonarr-genre-route-card'

const GenreRoutingSection = () => {
  const {
    instances = [],
    genres = [],
    genreRoutes = [],
    fetchGenres,
    fetchGenreRoutes,
    createGenreRoute,
    updateGenreRoute,
    deleteGenreRoute,
    isInitialized,
  } = useConfig()

  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [localRoutes, setLocalRoutes] = useState<
    Array<{
      tempId: string
      name: string
      genre: string
      sonarrInstanceId: number
      rootFolder: string
    }>
  >([])
  const [savingRoutes, setSavingRoutes] = useState<{ [key: string]: boolean }>(
    {},
  )

  useEffect(() => {
    const loadInitialData = async () => {
      if (!isInitialized) {
        setIsLoading(true)
        try {
          await Promise.all([fetchGenreRoutes(), fetchGenres()])
        } catch (error) {
          toast({
            title: 'Error',
            description: 'Failed to load genre routing data',
            variant: 'destructive',
          })
        } finally {
          setIsLoading(false)
        }
      } else {
        setIsLoading(false)
      }
    }

    loadInitialData()
  }, [isInitialized, fetchGenreRoutes, fetchGenres, toast])

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
    if (!genres?.length && !isLoading) {
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

  const handleRemoveRoute = async (id: number) => {
    try {
      await deleteGenreRoute(id)
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
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
            onRemove={() => handleRemoveRoute(route.id)}
            onGenreDropdownOpen={handleGenreDropdownOpen}
            instances={instances}
            genres={genres}
            isSaving={!!savingRoutes[route.id]}
          />
        ))}

        {!localRoutes.length && !genreRoutes.length && !isLoading && (
          <div className="text-center py-8 text-text">
            <p>No genre routes configured</p>
            <Button onClick={handleAddRoute} className="mt-4">
              Add Your First Route
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default GenreRoutingSection
