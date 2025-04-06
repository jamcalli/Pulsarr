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
} from '@/components/ui/form'
import EditableCardHeader from '@/components/ui/editable-card-header'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useRef, useCallback } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

// Import types from the backend schema
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
  CriteriaValue,
} from '@root/schemas/content-router/content-router.schema'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'

// Define the year criteria form schema
const YearCriteriaSchema = z
  .discriminatedUnion('matchType', [
    // Exact year
    z.object({
      matchType: z.literal('exact'),
      year: z.coerce.number().int().min(1900).max(2100),
    }),

    // Year range
    z.object({
      matchType: z.literal('range'),
      minYear: z.coerce.number().int().min(1900).max(2100).optional(),
      maxYear: z.coerce.number().int().min(1900).max(2100).optional(),
    }),

    // Year list
    z.object({
      matchType: z.literal('list'),
      years: z.string(),
    }),
  ])
  .refine(
    (data) => {
      if (data.matchType === 'range') {
        return data.minYear !== undefined || data.maxYear !== undefined
      }
      return true
    },
    {
      message: 'At least one of min or max year must be specified',
      path: ['minYear'],
    },
  )
  .refine(
    (data) => {
      if (data.matchType === 'list') {
        const years = data.years
          .split(',')
          .map((y) => Number.parseInt(y.trim()))
          .filter((y) => !Number.isNaN(y))
        return years.length > 0 && years.every((y) => y >= 1900 && y <= 2100)
      }
      return true
    },
    {
      message:
        'Please enter valid years between 1900-2100, separated by commas',
      path: ['years'],
    },
  )

// Define the route form schema
const YearRouteFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Route name must be at least 2 characters.',
  }),
  target_instance_id: z.number().min(1, {
    message: 'Instance selection is required.',
  }),
  root_folder: z.string().min(1, {
    message: 'Root folder is required.',
  }),
  quality_profile: z.string().min(1, {
    message: 'Quality Profile is required',
  }),
  enabled: z.boolean().default(true),
  yearCriteria: YearCriteriaSchema,
})

type YearRouteFormValues = z.infer<typeof YearRouteFormSchema>

interface YearRouteCardProps {
  route: ContentRouterRule | Partial<ContentRouterRule>
  isNew?: boolean
  onCancel: () => void
  onSave: (data: ContentRouterRule | ContentRouterRuleUpdate) => Promise<void>
  onRemove?: () => void
  isSaving: boolean
  instances: (RadarrInstance | SonarrInstance)[]
  contentType: 'radarr' | 'sonarr'
}

const YearRouteCard = ({
  route,
  isNew = false,
  onCancel,
  onSave,
  onRemove,
  isSaving,
  instances,
  contentType,
}: YearRouteCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null)

  // Parse the existing criteria if available
  const getInitialCriteria = () => {
    if (!route?.criteria?.year) {
      return { matchType: 'exact' as const, year: new Date().getFullYear() }
    }

    const yearCriteria = route.criteria.year as CriteriaValue

    if (typeof yearCriteria === 'number') {
      return { matchType: 'exact' as const, year: yearCriteria }
    } else if (Array.isArray(yearCriteria)) {
      return {
        matchType: 'list' as const,
        years: yearCriteria.join(', '),
      }
    } else if (yearCriteria && typeof yearCriteria === 'object') {
      const rangeObj = yearCriteria as { min?: number; max?: number }
      return {
        matchType: 'range' as const,
        minYear: rangeObj.min,
        maxYear: rangeObj.max,
      }
    }

    // Default
    return { matchType: 'exact' as const, year: new Date().getFullYear() }
  }

  const form = useForm<YearRouteFormValues>({
    resolver: zodResolver(YearRouteFormSchema),
    defaultValues: {
      name: route?.name || `New Year Route`,
      target_instance_id: route?.target_instance_id || instances[0]?.id || 0,
      root_folder: route?.root_folder || '',
      quality_profile: route?.quality_profile?.toString() || '',
      enabled: route?.enabled !== false, // Default to true if not specified
      yearCriteria: getInitialCriteria(),
    },
    mode: 'all',
  })

  // Reset form when the route ID changes
  useEffect(() => {
    if (route?.id) {
      form.reset({
        name: route.name,
        target_instance_id: route.target_instance_id,
        root_folder: route.root_folder || '',
        quality_profile: route.quality_profile?.toString() || '',
        enabled: route.enabled !== false,
        yearCriteria: getInitialCriteria(),
      })
    }
  }, [route?.id])

  // Scroll effect for new cards
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
      form.setValue('target_instance_id', instanceId)
      form.setValue('root_folder', '', { shouldDirty: true })
      form.setValue('quality_profile', '', {
        shouldDirty: true,
        shouldValidate: true,
      })
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
  const matchType = form.watch('yearCriteria.matchType')

  const handleSubmit = async (data: YearRouteFormValues) => {
    try {
      // Transform the form data into the format expected by the content router
      const yearCriteria = data.yearCriteria
      let year: CriteriaValue

      if (yearCriteria.matchType === 'exact') {
        year = yearCriteria.year
      } else if (yearCriteria.matchType === 'range') {
        year = {
          min: yearCriteria.minYear,
          max: yearCriteria.maxYear,
        }
      } else if (yearCriteria.matchType === 'list') {
        year = yearCriteria.years
          .split(',')
          .map((y) => Number.parseInt(y.trim()))
          .filter((y) => !isNaN(y))
      } else {
        // Default fallback to ensure year is always assigned
        year = new Date().getFullYear()
      }

      const routeData: Omit<
        ContentRouterRule,
        'id' | 'created_at' | 'updated_at'
      > = {
        name: data.name,
        type: 'year',
        criteria: {
          year,
        },
        target_type: contentType,
        target_instance_id: data.target_instance_id,
        // Convert quality_profile from string to number or null
        quality_profile: data.quality_profile
          ? Number.parseInt(data.quality_profile, 10)
          : null,
        root_folder: data.root_folder,
        enabled: data.enabled,
        order: route.order ?? 50, // Use existing order or default to 50
      }

      // If this is a new route, we want to create a new rule
      // If it's an existing route, we want to update it
      if (isNew) {
        await onSave(routeData)
      } else {
        // For updates, we need to include the ID
        const updateData: ContentRouterRuleUpdate = {
          ...routeData,
        }
        await onSave(updateData)
      }
    } catch (error) {
      console.error('Failed to save year route:', error)
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
            <EditableCardHeader
              title={form.watch('name')}
              isNew={isNew}
              isSaving={isSaving}
              isDirty={form.formState.isDirty}
              isValid={form.formState.isValid}
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
                              <RadioGroupItem value="exact" id="exact" />
                              <label
                                htmlFor="exact"
                                className="text-sm text-text font-medium"
                              >
                                Exact Year
                              </label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="range" id="range" />
                              <label
                                htmlFor="range"
                                className="text-sm text-text font-medium"
                              >
                                Year Range
                              </label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="list" id="list" />
                              <label
                                htmlFor="list"
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
                              onChange={(e) =>
                                field.onChange(
                                  Number.parseInt(e.target.value) || '',
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
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ''
                                      ? undefined
                                      : Number.parseInt(e.target.value),
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
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ''
                                      ? undefined
                                      : Number.parseInt(e.target.value),
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
                          value={field.value.toString()}
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
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select root folder" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectedInstance?.data?.rootFolders?.map(
                              (folder) => (
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
                          value={field.value?.toString()}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select quality profile" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectedInstance?.data?.qualityProfiles?.map(
                              (profile) => (
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
