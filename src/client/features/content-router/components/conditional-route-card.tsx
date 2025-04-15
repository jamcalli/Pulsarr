import { useState, useEffect, useCallback, useRef } from 'react'
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
  FormDescription,
} from '@/components/ui/form'
import { Slider } from '@/components/ui/slider'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ConditionalRouteFormSchema,
  type ConditionalRouteFormValues,
  type IConditionGroup,
} from '@/features/content-router/schemas/content-router.schema'
import { useToast } from '@/hooks/use-toast'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
} from '@root/schemas/content-router/content-router.schema'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'
import RouteCardHeader from '@/components/ui/route-card-header'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConditionGroupComponent from './condition-group'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { EvaluatorMetadata } from './condition-builder'

// Define criteria interface to match backend schema
interface Criteria {
  condition?: IConditionGroup
  [key: string]: IConditionGroup | undefined
}

// Extended ContentRouterRule to include criteria property
interface ExtendedContentRouterRule extends ContentRouterRule {
  criteria?: Criteria
}

interface ConditionalRouteCardProps {
  route: ExtendedContentRouterRule | Partial<ExtendedContentRouterRule>
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

const ConditionalRouteCard = ({
  route,
  isNew = false,
  onCancel,
  onSave,
  onRemove,
  onToggleEnabled,
  isSaving,
  isTogglingState = false,
  instances = [],
  contentType,
}: ConditionalRouteCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [evaluatorMetadata, setEvaluatorMetadata] = useState<
    EvaluatorMetadata[]
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getInitialConditionValue = useCallback((): IConditionGroup => {
    // Check if route has criteria with condition
    if (route?.criteria && 'condition' in route.criteria) {
      return route.criteria.condition as IConditionGroup
    }
    // Default to an empty AND condition group
    return {
      operator: 'AND',
      conditions: [
        {
          field: 'year',
          operator: 'equals',
          value: new Date().getFullYear(),
          negate: false,
        },
      ],
      negate: false,
    }
  }, [route])

  const form = useForm<ConditionalRouteFormValues>({
    resolver: zodResolver(ConditionalRouteFormSchema),
    defaultValues: {
      name:
        route?.name ||
        `New ${contentType === 'radarr' ? 'Movie' : 'Show'} Route`,
      condition: getInitialConditionValue(),
      target_instance_id:
        route?.target_instance_id ||
        (instances.length > 0 ? instances[0].id : 0),
      root_folder: route?.root_folder || '',
      quality_profile:
        route?.quality_profile !== undefined && route?.quality_profile !== null
          ? route.quality_profile.toString()
          : '',
      enabled: route?.enabled !== false,
      order: route?.order ?? 50,
    },
    mode: 'all',
  })

  // Fetch available evaluator metadata when the component loads
  useEffect(() => {
    const fetchEvaluatorMetadata = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/v1/content-router/plugins/metadata')
        if (!response.ok) {
          throw new Error('Failed to fetch evaluator metadata')
        }
        const data = await response.json()
        setEvaluatorMetadata(data.evaluators || [])
      } catch (err) {
        setError('Failed to load condition options. Please try again later.')
        console.error('Error fetching evaluator metadata:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchEvaluatorMetadata()
  }, [])

  const resetForm = useCallback(() => {
    form.reset({
      name:
        route?.name ||
        `New ${contentType === 'radarr' ? 'Movie' : 'Show'} Route`,
      condition: getInitialConditionValue(),
      target_instance_id:
        route?.target_instance_id ||
        (instances.length > 0 ? instances[0].id : 0),
      root_folder: route?.root_folder || '',
      quality_profile:
        route?.quality_profile !== undefined && route?.quality_profile !== null
          ? route.quality_profile.toString()
          : '',
      enabled: route?.enabled !== false,
      order: route?.order ?? 50,
    })
  }, [form, route, contentType, instances, getInitialConditionValue])

  useEffect(() => {
    if (!isNew && (('id' in route && route.id) || instances.length > 0)) {
      resetForm()
    }
  }, [route, isNew, instances, resetForm])

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

  const setTitleValue = useCallback(
    (title: string) => {
      form.setValue('name', title, { shouldDirty: true })
    },
    [form],
  )

  const handleToggleEnabled = async () => {
    if (onToggleEnabled && 'id' in route && route.id) {
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

  const handleSubmit = async (data: ConditionalRouteFormValues) => {
    try {
      // For new routes (creating a route)
      if (isNew) {
        const routeData: ContentRouterRule = {
          id: 0, // This will be ignored by the backend
          name: data.name,
          target_type: contentType,
          target_instance_id: data.target_instance_id,
          quality_profile: data.quality_profile
            ? Number(data.quality_profile)
            : undefined,
          root_folder: data.root_folder,
          enabled: data.enabled,
          order: data.order,
          condition: data.condition, // Use condition directly instead of criteria
          created_at: '', // This will be set by the backend
          updated_at: '', // This will be set by the backend
        }

        await onSave(routeData)
      }
      // For existing routes (updating a route)
      else {
        const updatePayload: ContentRouterRuleUpdate = {
          name: data.name,
          condition: data.condition, // Use condition directly
          target_instance_id: data.target_instance_id,
          quality_profile: data.quality_profile
            ? Number(data.quality_profile)
            : undefined,
          root_folder: data.root_folder,
          enabled: data.enabled,
          order: data.order,
        }

        await onSave(updatePayload)
      }
    } catch (error: unknown) {
      console.error('Failed to save conditional route:', error)
      toast({
        title: 'Error',
        description: `Failed to save conditional route: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
                !isNew && 'id' in route && route.id
                  ? handleToggleEnabled
                  : undefined
              }
              onSave={form.handleSubmit(handleSubmit)}
              onCancel={handleCancel}
              onDelete={onRemove}
              onTitleChange={setTitleValue}
            />
            <CardContent>
              <div className="grid gap-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Condition Builder Section */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-text">
                          Condition Rules
                        </FormLabel>
                        <FormControl>
                          <div className="border rounded-md p-4 bg-card/50">
                            <ConditionGroupComponent
                              value={field.value}
                              onChange={field.onChange}
                              evaluatorMetadata={evaluatorMetadata}
                              isLoading={loading}
                            />
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs">
                          Build complex conditions to determine when this route
                          should be applied
                        </FormDescription>
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

                {/* Instance Selection */}
                <div className="grid gap-4 md:grid-cols-1">
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

                {/* Root Folder & Quality Profile */}
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

export default ConditionalRouteCard
