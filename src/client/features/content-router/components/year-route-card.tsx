import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  YearRouteFormSchema,
  type YearRouteFormValues,
} from '@/features/content-router/schemas/content-router.schema'
import { useToast } from '@/hooks/use-toast'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
  CriteriaValue,
} from '@root/schemas/content-router/content-router.schema'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'
import RouteCardHeader from '@/components/ui/route-card-header'

interface YearRouteCardProps {
  route: ContentRouterRule | Partial<ContentRouterRule>
  isNew?: boolean
  onCancel: () => void
  onSave: (data: ContentRouterRule | ContentRouterRuleUpdate) => Promise<void>
  onRemove?: () => void
  onToggleEnabled?: (id: number, enabled: boolean) => Promise<void>
  isSaving: boolean
  isTogglingState?: boolean
  instances: (RadarrInstance | SonarrInstance)[]
  contentType: 'radarr' | 'sonarr'
}

const YearRouteCard = ({
  route,
  isNew = false,
  onCancel,
  onSave,
  onRemove,
  onToggleEnabled,
  isSaving,
  isTogglingState = false,
  instances,
  contentType,
}: YearRouteCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const getInitialCriteria = useCallback(() => {
    if (!route?.criteria?.year) {
      return { matchType: 'exact' as const, year: new Date().getFullYear() }
    }

    const yearCriteria = route.criteria.year as CriteriaValue

    if (typeof yearCriteria === 'number') {
      return { matchType: 'exact' as const, year: yearCriteria }
    }
    if (Array.isArray(yearCriteria)) {
      return {
        matchType: 'list' as const,
        years: yearCriteria.join(', '),
      }
    }
    if (yearCriteria && typeof yearCriteria === 'object') {
      const rangeObj = yearCriteria as { min?: number; max?: number }
      return {
        matchType: 'range' as const,
        minYear: rangeObj.min,
        maxYear: rangeObj.max,
      }
    }

    return { matchType: 'exact' as const, year: new Date().getFullYear() }
  }, [route?.criteria?.year])

  const form = useForm<YearRouteFormValues>({
    resolver: zodResolver(YearRouteFormSchema),
    defaultValues: {
      name: route?.name || 'New Year Route',
      target_instance_id: route?.target_instance_id || instances[0]?.id || 0,
      root_folder: route?.root_folder || '',
      quality_profile: route?.quality_profile?.toString() || '',
      enabled: route?.enabled !== false,
      yearCriteria: getInitialCriteria(),
      order: route?.order ?? 50,
    },
    mode: 'all',
  })

  const resetForm = useCallback(() => {
    form.reset({
      name: route?.name || 'New Year Route',
      target_instance_id: route?.target_instance_id || instances[0]?.id || 0,
      root_folder: route?.root_folder || '',
      quality_profile: route?.quality_profile?.toString() || '',
      enabled: route?.enabled !== false,
      yearCriteria: getInitialCriteria(),
      order: route?.order ?? 50,
    })
  }, [form, route, instances, getInitialCriteria])

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

  // Trigger validation on mount for new cards
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
  const matchType = form.watch('yearCriteria.matchType')

  // Add handler for toggle enabled
  const handleToggleEnabled = async () => {
    if (onToggleEnabled && route.id) {
      await onToggleEnabled(route.id, !form.watch('enabled'))
    }
  }

  const handleSubmit = async (data: YearRouteFormValues) => {
    try {
      const yearCriteria = data.yearCriteria
      let year: CriteriaValue

      if (yearCriteria.matchType === 'exact') {
        year = yearCriteria.year
      } else if (yearCriteria.matchType === 'range') {
        const range: { min?: number; max?: number } = {}
        if (
          yearCriteria.minYear !== undefined &&
          yearCriteria.minYear !== null
        ) {
          range.min = yearCriteria.minYear
        }
        if (
          yearCriteria.maxYear !== undefined &&
          yearCriteria.maxYear !== null
        ) {
          range.max = yearCriteria.maxYear
        }
        year = Object.keys(range).length > 0 ? range : null
      } else if (yearCriteria.matchType === 'list') {
        year = yearCriteria.years
          .split(',')
          .map((y) => Number.parseInt(y.trim(), 10))
          .filter((y) => !Number.isNaN(y))
      } else {
        console.warn('Unexpected matchType in year criteria:', yearCriteria)
        year = null
      }

      if (year === undefined) {
        year = null
      }

      const routeData: Partial<ContentRouterRule> = {
        name: data.name,
        type: 'year',
        criteria: {
          year,
        },
        target_type: contentType,
        target_instance_id: data.target_instance_id,
        quality_profile: data.quality_profile
          ? Number.parseInt(data.quality_profile, 10)
          : null,
        root_folder: data.root_folder,
        enabled: data.enabled,
        order: data.order, // Include order in the data
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
        ) // Cast for clarity
      } else {
        const updatePayload: ContentRouterRuleUpdate = {
          name: data.name,
          criteria: { year },
          target_instance_id: data.target_instance_id,
          quality_profile: data.quality_profile
            ? Number(data.quality_profile)
            : null,
          root_folder: data.root_folder,
          enabled: data.enabled,
          order: data.order, // Include order in the update payload
        }
        await onSave(updatePayload)
      }
    } catch (error) {
      console.error('Failed to save year route:', error)
      toast({
        title: 'Error',
        description: `Failed to save year route: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      })
    }
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
              onCancel={onCancel}
              onDelete={onRemove}
              onTitleChange={setTitleValue}
            />
            <CardContent>
              <div className="grid gap-4">
                {/* First Row - Year Criteria */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="yearCriteria.matchType"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-text">
                          Year Match Type
                        </FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-col space-y-1"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem
                                value="exact"
                                id={`exact-${route?.id || 'new'}`}
                              />
                              <label
                                htmlFor={`exact-${route?.id || 'new'}`}
                                className="text-sm text-text font-medium"
                              >
                                Exact Year
                              </label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem
                                value="range"
                                id={`range-${route?.id || 'new'}`}
                              />
                              <label
                                htmlFor={`range-${route?.id || 'new'}`}
                                className="text-sm text-text font-medium"
                              >
                                Year Range
                              </label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem
                                value="list"
                                id={`list-${route?.id || 'new'}`}
                              />
                              <label
                                htmlFor={`list-${route?.id || 'new'}`}
                                className="text-sm text-text font-medium"
                              >
                                Year List
                              </label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Conditional fields based on match type */}
                  {matchType === 'exact' && (
                    <FormField
                      control={form.control}
                      name="yearCriteria.year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-text">Year</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1900"
                              max="2100"
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === ''
                                    ? undefined
                                    : Number.parseInt(e.target.value, 10),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {matchType === 'range' && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="yearCriteria.minYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-text">
                              From Year (Optional)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1900"
                                max="2100"
                                placeholder="1900"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ''
                                      ? undefined
                                      : Number.parseInt(e.target.value, 10),
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="yearCriteria.maxYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-text">
                              To Year (Optional)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1900"
                                max="2100"
                                placeholder="2100"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ''
                                      ? undefined
                                      : Number.parseInt(e.target.value, 10),
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {matchType === 'list' && (
                    <FormField
                      control={form.control}
                      name="yearCriteria.years"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-text">
                            Years (comma separated)
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="2020, 2021, 2022" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
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

                {/* Second Row - Instance Selection */}
                <div className="grid gap-4 md:grid-cols-2">
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

                {/* Third Row - Root Folder & Quality Profile */}
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

export default YearRouteCard
