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
import { useEffect, useRef, useCallback } from 'react'
import {
  GenreRouteFormSchema,
  type GenreRouteFormValues,
} from '@/features/content-router/schemas/content-router.schema'
import { useToast } from '@/hooks/use-toast'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
} from '@root/schemas/content-router/content-router.schema'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'

interface GenreRouteCardProps {
  route: ContentRouterRule | Partial<ContentRouterRule>
  isNew?: boolean
  onCancel: () => void
  onSave: (data: ContentRouterRule | ContentRouterRuleUpdate) => Promise<void>
  onRemove?: () => void
  isSaving: boolean
  onGenreDropdownOpen: () => Promise<void>
  instances: (RadarrInstance | SonarrInstance)[]
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
  const { toast } = useToast()

  const getInitialGenre = useCallback(() => {
    if (route?.criteria?.genre && typeof route.criteria.genre === 'string') {
      return route.criteria.genre
    }
    return ''
  }, [route?.criteria?.genre])

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
      enabled: route?.enabled !== false,
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

  useEffect(() => {
    if (!isNew && (route?.id || instances.length > 0)) {
      resetForm()
    }
  }, [route?.id, isNew, instances, resetForm])

  useEffect(() => {
    if (isNew && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [isNew])

  useEffect(() => {
    if (isNew) {
      onGenreDropdownOpen()
    }
  }, [isNew, onGenreDropdownOpen])

  useEffect(() => {
    if (isNew) {
      setTimeout(() => form.trigger(), 0)
    }
  }, [form, isNew])

  const setTitleValue = useCallback(
    (title: string) => {
      form.setValue('name', title, { shouldDirty: true })
    },
    [form],
  )

  const handleInstanceChange = useCallback(
    (value: string) => {
      const instanceId = Number.parseInt(value, 10)
      if (!Number.isNaN(instanceId)) {
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

  const getSelectedInstance = useCallback(() => {
    return instances.find(
      (inst) => inst.id === form.watch('target_instance_id'),
    )
  }, [instances, form])

  const selectedInstance = getSelectedInstance()

  const handleSubmit = async (data: GenreRouteFormValues) => {
    try {
      const routeData: Partial<ContentRouterRule> = {
        name: data.name,
        type: 'genre',
        criteria: {
          genre: data.genre,
        },
        target_type: contentType,
        target_instance_id: data.target_instance_id,
        quality_profile: data.quality_profile
          ? Number(data.quality_profile)
          : null,
        root_folder: data.root_folder,
        enabled: data.enabled,
        order: route?.order ?? 50,
      }

      if (isNew) {
        routeData.id = undefined
        routeData.created_at = undefined
        routeData.updated_at = undefined
        await onSave(
          routeData as Omit<
            ContentRouterRule,
            'id' | 'created_at' | 'updated_at'
          >,
        )
      } else {
        const updatePayload: ContentRouterRuleUpdate = {
          name: data.name,
          criteria: { genre: data.genre },
          target_instance_id: data.target_instance_id,
          quality_profile: data.quality_profile
            ? Number(data.quality_profile)
            : null,
          root_folder: data.root_folder,
          enabled: data.enabled,
          order: route?.order ?? 50,
        }
        await onSave(updatePayload)
      }
    } catch (error) {
      console.error('Failed to save genre route:', error)
      toast({
        title: 'Error',
        description: `Failed to save genre route: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      })
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
                          value={field.value || ''}
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
                          value={field.value || ''}
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
