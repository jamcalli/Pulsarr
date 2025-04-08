import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import GenreMultiSelect from '@/components/ui/genre-multi-select'
import { cn } from '@/lib/utils'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Slider } from '@/components/ui/slider'
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
import RouteCardHeader from '@/components/ui/route-card-header'

interface GenreRouteCardProps {
  route: ContentRouterRule | Partial<ContentRouterRule>
  isNew?: boolean
  onCancel: () => void
  onSave: (data: ContentRouterRule | ContentRouterRuleUpdate) => Promise<void>
  onRemove?: () => void
  onToggleEnabled?: (id: number, enabled: boolean) => Promise<void>
  isSaving: boolean
  isTogglingState?: boolean
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
  onToggleEnabled,
  isSaving,
  isTogglingState = false,
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
      order: route?.order ?? 50,
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
      order: route?.order ?? 50,
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

  const handleToggleEnabled = async () => {
    if (onToggleEnabled && route.id) {
      await onToggleEnabled(route.id, !form.watch('enabled'))
    }
  }

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
        order: data.order,
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
          order: data.order,
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
            <RouteCardHeader
              title={form.watch('name')}
              isNew={isNew}
              isSaving={isSaving}
              isDirty={form.formState.isDirty}
              isValid={form.formState.isValid}
              enabled={form.watch('enabled')}
              isTogglingState={isTogglingState}
              onToggleEnabled={
                !isNew && route.id ? handleToggleEnabled : undefined
              }
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
                        <FormControl>
                          <GenreMultiSelect field={field} genres={genres} />
                        </FormControl>
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

                {/* Weight/Priority Slider */}
                <FormField
                  control={form.control}
                  name="order"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-text">
                          Priority Weight
                        </FormLabel>
                        <span className="text-sm text-text text-muted-foreground">
                          {field.value}
                        </span>
                      </div>
                      <FormControl>
                        <Slider
                          defaultValue={[field.value]}
                          min={1}
                          max={100}
                          step={1}
                          onValueChange={(vals) => field.onChange(vals[0])}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Higher values give this route greater priority (1-100)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
