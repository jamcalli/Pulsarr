import type React from 'react'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Trash2, Loader2, Pen, Save } from 'lucide-react'
import { useConfig } from '@/context/context'
import { useToast } from '@/hooks/use-toast'

interface GenreRoute {
  name: string
  id: number
  sonarrInstanceId: number
  genre: string
  rootFolder: string
}

interface EditableCardHeaderProps {
  name: string
  onNameChange: (newName: string) => void
  onRemove?: () => void
  isNew?: boolean
  onSave?: () => void
  onCancel?: () => void
  hasChanges?: boolean
  isSaving?: boolean
  modifiedName?: string
}

const EditableCardHeader = ({
  name,
  onNameChange,
  onRemove,
  isNew = false,
  onSave,
  onCancel, // Add to props
  hasChanges = false,
  isSaving = false,
  modifiedName,
}: EditableCardHeaderProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [localName, setLocalName] = useState(name)

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (localName?.trim()) {
      onNameChange(localName)
      setIsEditing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNameSubmit(e)
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setLocalName(name)
    }
  }

  // Use modifiedName if available, otherwise use original name
  const displayName = modifiedName || name

  return (
    <CardHeader>
      <CardTitle className="flex justify-between items-center text-text">
        {/* Name editing section */}
        <div className="group/name inline-flex items-center gap-2 w-1/2">
          {isEditing ? (
            <div className="flex-grow">
              <Input
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                autoFocus
                onKeyDown={handleKeyDown}
                onBlur={handleNameSubmit}
                className="w-full"
                disabled={isSaving}
              />
            </div>
          ) : (
            <>
              <span>{displayName || 'Unnamed Route'}</span>
              {!isSaving && (
                <Button
                  variant="noShadow"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover/name:opacity-100 transition-opacity"
                  onClick={() => {
                    setLocalName(displayName)
                    setIsEditing(true)
                  }}
                >
                  <Pen className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* Action buttons section */}
        <div className="flex gap-2">
          {/* Show Cancel and Save buttons when changes exist */}
          {(isNew || hasChanges) && (
            <>
              {onCancel && (
                <Button
                  variant="cancel"
                  onClick={onCancel}
                  className="flex items-center gap-2"
                  disabled={isSaving}
                >
                  <span>Cancel</span>
                </Button>
              )}
              {onSave && (
                <Button
                  variant="blue"
                  onClick={onSave}
                  className="flex items-center gap-2"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          {/* Remove button */}
          {onRemove && (
            <Button
              variant="error"
              size="icon"
              onClick={onRemove}
              disabled={isSaving}
              className="transition-opacity"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardTitle>
    </CardHeader>
  )
}

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
    (Omit<GenreRoute, 'id'> & { tempId: string })[]
  >([])
  const [savingRoutes, setSavingRoutes] = useState<{ [key: string]: boolean }>(
    {},
  )
  const [modifiedRoutes, setModifiedRoutes] = useState<{
    [key: number]: Partial<GenreRoute>
  }>({})

  useEffect(() => {
    const loadInitialData = async () => {
      if (!isInitialized) {
        setIsLoading(true)
        try {
          // Fetch both in parallel since they don't depend on each other
          await Promise.all([
            fetchGenreRoutes(),
            fetchGenres(), // Pre-fetch genres to avoid additional request later
          ])
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

  const handleCancelChanges = (id: number) => {
    // Find the original route to revert to
    const originalRoute = genreRoutes.find((route) => route.id === id)
    if (!originalRoute) return

    // Force update the Select values by dispatching change events with original values
    // This ensures the UI reflects the original state
    handleRouteChange(id, 'name', originalRoute.name)
    handleRouteChange(id, 'genre', originalRoute.genre)
    handleRouteChange(id, 'sonarrInstanceId', originalRoute.sonarrInstanceId)
    handleRouteChange(id, 'rootFolder', originalRoute.rootFolder)

    // Clear modifications after a small delay to ensure UI updates first
    setTimeout(() => {
      setModifiedRoutes((prev) => {
        const newState = { ...prev }
        delete newState[id]
        return newState
      })
    }, 0)
  }

  const handleCancelLocalChanges = (tempId: string) => {
    const initialState = {
      tempId,
      name: 'New Genre Route',
      sonarrInstanceId: instances[0]?.id || 0,
      genre: '',
      rootFolder: instances[0]?.rootFolder || '',
    }

    setLocalRoutes((prev) =>
      prev.map((route) => (route.tempId === tempId ? initialState : route)),
    )
  }

  const handleAddRoute = () => {
    setLocalRoutes([
      ...localRoutes,
      {
        tempId: `temp-${Date.now()}`,
        name: 'New Genre Route',
        sonarrInstanceId: instances[0]?.id || 0,
        genre: '',
        rootFolder: instances[0]?.rootFolder || '',
      },
    ])
  }

  const handleLocalRouteChange = (
    tempId: string,
    field: keyof Omit<GenreRoute, 'id'>,
    value: string | number,
  ) => {
    setLocalRoutes(
      localRoutes.map((route) =>
        route.tempId === tempId ? { ...route, [field]: value } : route,
      ),
    )
  }

  const handleSaveExistingRoute = async (id: number) => {
    try {
      const updates = modifiedRoutes[id]
      if (!updates) return

      setSavingRoutes((prev) => ({ ...prev, [id]: true }))

      // Create a promise that resolves after 1 second
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Wait for both the save operation and the minimum time to complete
      await Promise.all([updateGenreRoute(id, updates), minimumLoadingTime])

      setModifiedRoutes((prev) => {
        const newState = { ...prev }
        delete newState[id]
        return newState
      })

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

  const handleSaveRoute = async (tempId: string) => {
    const route = localRoutes.find((r) => r.tempId === tempId)
    if (!route) return

    setSavingRoutes((prev) => ({ ...prev, [tempId]: true }))
    try {
      // Create a promise that resolves after 1 second
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Wait for both the save operation and the minimum time to complete
      await Promise.all([
        createGenreRoute({
          name: route.name,
          sonarrInstanceId: route.sonarrInstanceId,
          genre: route.genre,
          rootFolder: route.rootFolder,
        }),
        minimumLoadingTime,
      ])

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

  const handleRemoveLocalRoute = (tempId: string) => {
    setLocalRoutes(localRoutes.filter((route) => route.tempId !== tempId))
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

  const handleRouteChange = useCallback(
    (id: number, field: keyof GenreRoute, value: string | number) => {
      setModifiedRoutes((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          [field]: value,
        },
      }))
    },
    [],
  )

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
          <Card key={route.tempId} className="bg-bg">
            <EditableCardHeader
              name={route.name}
              onNameChange={(newName) =>
                handleLocalRouteChange(route.tempId, 'name', newName)
              }
              onRemove={() => handleRemoveLocalRoute(route.tempId)}
              isNew={true}
              onSave={() => handleSaveRoute(route.tempId)}
              onCancel={() => handleCancelLocalChanges(route.tempId)}
              hasChanges={true}
              isSaving={!!savingRoutes[route.tempId]}
            />
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Select
                    value={route.genre || ''}
                    onValueChange={(value) =>
                      handleLocalRouteChange(route.tempId, 'genre', value)
                    }
                    onOpenChange={(open) => {
                      if (open) handleGenreDropdownOpen()
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select genre">
                        {route.genre || 'Select genre'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(genres) &&
                        genres.map((genre) => (
                          <SelectItem key={genre} value={genre}>
                            {genre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Select
                    value={route.sonarrInstanceId.toString()}
                    onValueChange={(value) =>
                      handleLocalRouteChange(
                        route.tempId,
                        'sonarrInstanceId',
                        Number.parseInt(value),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select instance">
                        {instances.find((i) => i.id === route.sonarrInstanceId)
                          ?.name || 'Select instance'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(instances) &&
                        instances.map((instance) => (
                          <SelectItem
                            key={instance.id}
                            value={instance.id.toString()}
                          >
                            {instance.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Select
                    value={route.rootFolder || ''}
                    onValueChange={(value) =>
                      handleLocalRouteChange(route.tempId, 'rootFolder', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select root folder">
                        {route.rootFolder || 'Select root folder'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {instances
                        .find((inst) => inst.id === route.sonarrInstanceId)
                        ?.data?.rootFolders?.map((folder) => (
                          <SelectItem key={folder.path} value={folder.path}>
                            {folder.path}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Saved routes */}
        {Array.isArray(genreRoutes) &&
          genreRoutes.map((route) => (
            <Card key={route.id} className="bg-bg">
              <EditableCardHeader
                name={route.name}
                modifiedName={modifiedRoutes[route.id]?.name}
                onNameChange={(newName) =>
                  handleRouteChange(route.id, 'name', newName)
                }
                onRemove={() => handleRemoveRoute(route.id)}
                hasChanges={!!modifiedRoutes[route.id]}
                onSave={() => handleSaveExistingRoute(route.id)}
                onCancel={() => handleCancelChanges(route.id)}
                isSaving={!!savingRoutes[route.id]}
              />
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Select
                      value={
                        (modifiedRoutes[route.id]?.genre ?? route.genre) || ''
                      }
                      onValueChange={(value) =>
                        handleRouteChange(route.id, 'genre', value)
                      }
                      onOpenChange={(open) => {
                        if (open) handleGenreDropdownOpen()
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select genre">
                          {(modifiedRoutes[route.id]?.genre ?? route.genre) ||
                            'Select genre'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Array.isArray(genres) &&
                          genres.map((genre) => (
                            <SelectItem key={genre} value={genre}>
                              {genre}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Select
                      value={(
                        modifiedRoutes[route.id]?.sonarrInstanceId ??
                        route.sonarrInstanceId
                      ).toString()}
                      onValueChange={(value) =>
                        handleRouteChange(
                          route.id,
                          'sonarrInstanceId',
                          Number.parseInt(value),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select instance">
                          {instances.find(
                            (i) =>
                              i.id ===
                              (modifiedRoutes[route.id]?.sonarrInstanceId ??
                                route.sonarrInstanceId),
                          )?.name || 'Select instance'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Array.isArray(instances) &&
                          instances.map((instance) => (
                            <SelectItem
                              key={instance.id}
                              value={instance.id.toString()}
                            >
                              {instance.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Select
                      value={
                        (modifiedRoutes[route.id]?.rootFolder ??
                          route.rootFolder) ||
                        ''
                      }
                      onValueChange={(value) =>
                        handleRouteChange(route.id, 'rootFolder', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select root folder">
                          {(modifiedRoutes[route.id]?.rootFolder ??
                            route.rootFolder) ||
                            'Select root folder'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {instances
                          .find(
                            (inst) =>
                              inst.id ===
                              (modifiedRoutes[route.id]?.sonarrInstanceId ??
                                route.sonarrInstanceId),
                          )
                          ?.data?.rootFolders?.map((folder) => (
                            <SelectItem key={folder.path} value={folder.path}>
                              {folder.path}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
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
