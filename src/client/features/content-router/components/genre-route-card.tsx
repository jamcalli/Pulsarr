import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import EditableCardHeader from '@/components/ui/editable-card-header'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useRef, useCallback } from 'react'

// Define the schema for content router genre rule form
const GenreRouteFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  genre: z.string().min(1, {
    message: 'Genre is required.',
  }),
  target_instance_id: z.number().positive({
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
  enabled: z.boolean().default(true),
})

type GenreRouteFormValues = z.infer<typeof GenreRouteFormSchema>

interface GenreRouteCardProps {
  route: any // This could be further typed with ContentRouterRule type
  isNew?: boolean
  onCancel: () => void
  onSave: (data: any) => Promise<void>
  onRemove?: () => void
  isSaving: boolean
  onGenreDropdownOpen: () => Promise<void>
  instances: any[]
  genres: string[]
  contentType: 'radarr' | 'sonarr'
}

const GenreRouteCard = ({
  route,
  isNew = false,
  onCancel,
  onSave,
  onRemove,
  isSaving,
  onGenreDropdownOpen,
  instances = [],
  genres = [],
  contentType,
}: GenreRouteCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null)

  // Helper to extract genre from criteria
  const getInitialGenre = useCallback(() => {
    if (route?.criteria?.genre && typeof route.criteria.genre === 'string') {
      return route.criteria.genre
    }
    return ''
  }, [route?.criteria?.genre])

  // Set up the form with either existing route data or defaults
  const form = useForm<GenreRouteFormValues>({
    resolver: zodResolver(GenreRouteFormSchema),
    defaultValues: {
      name:
        route?.name ||
        `New ${contentType === 'radarr' ? 'Movie' : 'Show'} Genre Route`,
      genre: getInitialGenre(),
      target_instance_id:
        route?.target_instance_id ||
        (instances.length > 0 ? instances[0].id : 0),
      root_folder: route?.root_folder || '',
      quality_profile: route?.quality_profile?.toString() || '',
      enabled: route?.enabled !== false, // Default to true if not specified
    },
    mode: 'all',
  })

  const resetForm = useCallback(() => {
    form.reset({
      name:
        route?.name ||
        `New ${contentType === 'radarr' ? 'Movie' : 'Show'} Genre Route`,
      genre: getInitialGenre(),
      target_instance_id:
        route?.target_instance_id ||
        (instances.length > 0 ? instances[0].id : 0),
      root_folder: route?.root_folder || '',
      quality_profile: route?.quality_profile?.toString() || '',
      enabled: route?.enabled !== false,
    })
  }, [form, route, contentType, instances, getInitialGenre])

  // Reset form when route ID changes or instances become available (for existing routes)
  useEffect(() => {
    if (!isNew && (route?.id || instances.length > 0)) {
      resetForm()
    }
  }, [route?.id, isNew, instances, resetForm])

  // Scroll effect for new cards
  useEffect(() => {
    if (isNew && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [isNew])

  // Fetch genre list when dropdown opens for an existing card, or on mount for new card
  useEffect(() => {
    if (isNew) {
      onGenreDropdownOpen()
    }
  }, [isNew, onGenreDropdownOpen])

  // Trigger validation on mount for new cards
  useEffect(() => {
    if (isNew) {
      setTimeout(() => form.trigger(), 0)
    }
  }, [form, isNew])

  // Title value setter
  const setTitleValue = useCallback(
    (title: string) => {
      form.setValue('name', title, { shouldDirty: true })
    },
    [form],
  )

  // Instance change handler
  const handleInstanceChange = useCallback(
    (value: string) => {
      const instanceId = Number.parseInt(value, 10)
      if (!isNaN(instanceId)) {
        form.setValue('target_instance_id', instanceId)
        form.setValue('root_folder', '', { shouldDirty: true })
        form.setValue('quality_profile', '', {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
    },
    [form],
  )

  // Get the currently selected instance
  const getSelectedInstance = useCallback(() => {
    return instances.find(
      (inst) => inst.id === form.watch('target_instance_id'),
    )
  }, [instances, form])

  const selectedInstance = getSelectedInstance()

  // Handle form submission
  const handleSubmit = async (data: GenreRouteFormValues) => {
    try {
      // Transform form data into the format expected by the content router
      const routeData = {
        name: data.name,
        type: 'genre',
        criteria: {
          genre: data.genre,
        },
        target_type: contentType,
        target_instance_id: data.target_instance_id,
        // Convert quality_profile back to number or null
        quality_profile: data.quality_profile
          ? Number(data.quality_profile)
          : null,
        root_folder: data.root_folder,
        enabled: data.enabled,
        order: route?.order ?? 50, // Default order value
      }

      if (isNew) {
        delete (routeData as any).id
        delete (routeData as any).created_at
        delete (routeData as any).updated_at
      }

      await onSave(routeData)
    } catch (error) {
      console.error('Failed to save genre route:', error)
      // TODO: Add user feedback (toast?)
    }
  }

  const handleCancel = () => {
    resetForm()
    onCancel()
  }

  return (
    <div className="relative" ref={cardRef}>
      {(form.formState.isDirty || isNew) && (
        <div
          className={cn(
            'absolute -inset-0.5 rounded-lg border-2 z-50',
            isNew ? 'border-blue' : 'border-fun',
            'animate-pulse pointer-events-none',
          )}
        />
      )}
      <Card className="bg-bg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <EditableCardHeader
              title={form.watch('name')}
              isNew={isNew}
              isSaving={isSaving}
              isDirty={form.formState.isDirty}
              isValid={form.formState.isValid}
              onSave={form.handleSubmit(handleSubmit)}
              onCancel={handleCancel}
              onDelete={onRemove}
              onTitleChange={setTitleValue}
            />
            <CardContent>
              <div className="grid gap-4">
                {/* First Row */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="genre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">Genre</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          onOpenChange={(open) => {
                            if (open) onGenreDropdownOpen()
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select genre" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {genres.map((genre) => (
                              <SelectItem key={genre} value={genre}>
                                {genre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="target_instance_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          {contentType === 'radarr' ? 'Radarr' : 'Sonarr'}{' '}
                          Instance
                        </FormLabel>
                        <Select
                          value={field.value?.toString() ?? ''}
                          onValueChange={handleInstanceChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select instance" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {instances.map((instance) => (
                              <SelectItem
                                key={instance.id}
                                value={instance.id.toString()}
                              >
                                {instance.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Second Row */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="root_folder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">Root Folder</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={
                            !selectedInstance?.data?.rootFolders?.length
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  !selectedInstance?.data?.rootFolders?.length
                                    ? 'N/A'
                                    : 'Select root folder'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectedInstance?.data?.rootFolders?.map(
                              (folder: { path: string }) => (
                                <SelectItem
                                  key={folder.path}
                                  value={folder.path}
                                >
                                  {folder.path}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quality_profile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          Quality Profile
                        </FormLabel>
                        <Select
                          value={field.value?.toString() || ''}
                          onValueChange={field.onChange}
                          disabled={
                            !selectedInstance?.data?.qualityProfiles?.length
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  !selectedInstance?.data?.qualityProfiles
                                    ?.length
                                    ? 'N/A'
                                    : 'Select quality profile'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectedInstance?.data?.qualityProfiles?.map(
                              (profile: { id: number; name: string }) => (
                                <SelectItem
                                  key={profile.id}
                                  value={profile.id.toString()}
                                >
                                  {profile.name}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </form>
        </Form>
      </Card>
    </div>
  )
}

export default GenreRouteCard
