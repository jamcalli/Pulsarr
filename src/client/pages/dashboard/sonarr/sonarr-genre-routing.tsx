import type React from 'react'
import { useEffect, useState } from 'react'
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

const EditableCardHeader = ({
  name,
  onNameChange,
  onRemove,
  isNew = false,
  onSave,
  hasChanges = false,
}: {
  name: string
  onNameChange: (newName: string) => void
  onRemove?: () => void
  isNew?: boolean
  onSave?: () => void
  hasChanges?: boolean
}) => {
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

  return (
    <CardHeader>
      <CardTitle className="flex justify-between items-center text-text">
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
              />
            </div>
          ) : (
            <>
              <span>{name || 'Unnamed Route'}</span>
              <Button
                variant="noShadow"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover/name:opacity-100 transition-opacity"
                onClick={() => {
                  setLocalName(name)
                  setIsEditing(true)
                }}
              >
                <Pen className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {(isNew || hasChanges) && onSave && (
            <Button
              variant="noShadow"
              onClick={onSave}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          )}
          {onRemove && (
            <Button variant="error" size="icon" onClick={onRemove}>
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
  } = useConfig()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false)
  const [localRoutes, setLocalRoutes] = useState<
    (Omit<GenreRoute, 'id'> & { tempId: string })[]
  >([])
  const [modifiedRoutes, setModifiedRoutes] = useState<{
    [key: number]: Partial<GenreRoute>
  }>({})

  // Fetch initial routes
  useEffect(() => {
    if (!hasAttemptedFetch) {
      const loadRoutes = async () => {
        setIsLoading(true)
        try {
          await fetchGenreRoutes()
        } catch (error) {
          toast({
            title: 'Error',
            description: 'Failed to fetch genre routes',
            variant: 'destructive',
          })
        } finally {
          setIsLoading(false)
          setHasAttemptedFetch(true)
        }
      }

      loadRoutes()
    }
  }, [fetchGenreRoutes, toast, hasAttemptedFetch])

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

      await updateGenreRoute(id, updates)

      const newModifiedRoutes = { ...modifiedRoutes }
      delete newModifiedRoutes[id]
      setModifiedRoutes(newModifiedRoutes)

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
    }
  }

  const handleSaveRoute = async (tempId: string) => {
    const route = localRoutes.find((r) => r.tempId === tempId)
    if (!route) return
    try {
      await createGenreRoute({
        name: route.name,
        sonarrInstanceId: route.sonarrInstanceId,
        genre: route.genre,
        rootFolder: route.rootFolder,
      })

      setLocalRoutes(localRoutes.filter((r) => r.tempId !== tempId))

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

  const handleRouteChange = async (
    id: number,
    field: keyof GenreRoute,
    value: string | number,
  ) => {
    try {
      setModifiedRoutes((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          [field]: value,
        },
      }))
      await updateGenreRoute(id, {
        [field]: value,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update genre route',
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
          <Card key={route.tempId} className="bg-bg">
            <EditableCardHeader
              name={route.name}
              onNameChange={(newName) =>
                handleLocalRouteChange(route.tempId, 'name', newName)
              }
              onRemove={() => handleRemoveLocalRoute(route.tempId)}
              isNew={true}
              onSave={() => handleSaveRoute(route.tempId)}
              hasChanges={false}
            />
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Select
                    value={route.genre}
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
                      <SelectValue placeholder="Select instance" />
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
                    value={route.rootFolder}
                    onValueChange={(value) =>
                      handleLocalRouteChange(route.tempId, 'rootFolder', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select root folder" />
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
                onNameChange={(newName) =>
                  handleRouteChange(route.id, 'name', newName)
                }
                onRemove={() => handleRemoveRoute(route.id)}
                hasChanges={!!modifiedRoutes[route.id]}
                onSave={() => handleSaveExistingRoute(route.id)}
              />
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Select
                      value={route.genre}
                      onValueChange={(value) =>
                        handleRouteChange(route.id, 'genre', value)
                      }
                      onOpenChange={(open) => {
                        if (open) handleGenreDropdownOpen()
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select genre">
                          {/* This is where we preselect the genre */}
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
                        handleRouteChange(
                          route.id,
                          'sonarrInstanceId',
                          Number.parseInt(value),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select instance" />
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
                      value={route.rootFolder}
                      onValueChange={(value) =>
                        handleRouteChange(route.id, 'rootFolder', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select root folder" />
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
