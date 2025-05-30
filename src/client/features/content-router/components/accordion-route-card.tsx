import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ContentRouterContext } from '@/features/content-router/hooks/useContentRouter'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
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
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertCircle,
  HelpCircle,
  Info,
  Loader2,
  Pen,
  Plus,
  Save,
  Trash2,
  X,
  Power,
} from 'lucide-react'
import { SONARR_MONITORING_OPTIONS } from '@/features/sonarr/store/constants'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConditionGroupComponent from '@/features/content-router/components/condition-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useConfigStore } from '@/stores/configStore'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TagsMultiSelect } from '@/components/ui/tag-multi-select'
import { TagCreationDialog } from '@/components/ui/tag-creation-dialog'
import type {
  ConditionValue,
  ContentRouterRule,
  ContentRouterRuleUpdate,
  ConditionGroup,
  IConditionGroup,
} from '@root/schemas/content-router/content-router.schema'
import type { EvaluatorMetadata } from '@root/schemas/content-router/evaluator-metadata.schema'
import {
  ConditionalRouteFormSchema,
  type ConditionalRouteFormValues,
} from '@/features/content-router/schemas/content-router.schema'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'

// Define criteria interface to match backend schema
interface Criteria {
  condition?: ConditionGroup
  genre?: string | string[]
  year?: number | number[] | { min?: number; max?: number }
  originalLanguage?: string | string[]
  users?: string | string[]
  [key: string]: ConditionValue | ConditionGroup | undefined
}

// Extended ContentRouterRule to include criteria and type
interface ExtendedContentRouterRule extends ContentRouterRule {
  type?: string
  criteria?: Criteria
  condition?: ConditionGroup
}

interface AccordionRouteCardProps {
  route: ExtendedContentRouterRule | Partial<ExtendedContentRouterRule>
  isNew?: boolean
  onCancel: () => void
  onSave: (data: ContentRouterRule | ContentRouterRuleUpdate) => Promise<void>
  onRemove?: () => void
  onToggleEnabled?: (id: number, enabled: boolean) => Promise<void>
  isSaving: boolean
  isTogglingState?: boolean
  instances: Array<RadarrInstance | SonarrInstance>
  genres?: string[]
  onGenreDropdownOpen?: () => Promise<void>
  contentType: 'radarr' | 'sonarr'
}

const AccordionRouteCard = ({
  route,
  isNew = false,
  onCancel,
  onSave,
  onRemove,
  onToggleEnabled,
  isSaving,
  instances = [],
  genres = [],
  onGenreDropdownOpen,
  contentType,
}: AccordionRouteCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [localTitle, setLocalTitle] = useState(route.name || '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [evaluatorMetadata, setEvaluatorMetadata] = useState<
    EvaluatorMetadata[]
  >([])
  const [accordionValue, setAccordionValue] = useState<string | undefined>(
    undefined,
  )
  const [showTagCreationDialog, setShowTagCreationDialog] = useState(false)
  const tagsMultiSelectRef =
    useRef<import('@/components/ui/tag-multi-select').TagsMultiSelectRef>(null)

  const { config } = useConfigStore()
  const isSessionMonitoringEnabled =
    config?.plexSessionMonitoring?.enabled || false

  // Refs to track component state
  const isSavingRef = useRef(false)
  const isDirtyRef = useRef(false)
  const latestFormValues = useRef<ConditionalRouteFormValues | null>(null)
  const hasInitializedForm = useRef(false)

  const getRouteId = useCallback(
    (
      routeObj: ExtendedContentRouterRule | Partial<ExtendedContentRouterRule>,
      isNewRoute: boolean,
    ): string | number | null => {
      if ('id' in routeObj && routeObj.id !== undefined) {
        const id = routeObj.id
        // Make sure we return a string or number, not an object
        if (typeof id === 'string' || typeof id === 'number') {
          return id
        }
      }

      if (isNewRoute && 'tempId' in routeObj && routeObj.tempId !== undefined) {
        const tempId = routeObj.tempId
        // Make sure we return a string or number, not an object
        if (typeof tempId === 'string' || typeof tempId === 'number') {
          return tempId
        }
      }

      return null
    },
    [],
  )

  // Use a route ID ref to detect actual route changes vs re-renders
  const routeIdRef = useRef<string | number | null>(getRouteId(route, isNew))

  // Create a default initial condition group for new routes
  const getInitialConditionValue = useCallback(
    (
      sourceRoute?:
        | ExtendedContentRouterRule
        | Partial<ExtendedContentRouterRule>,
    ): ConditionGroup => {
      // Check if source route has condition
      if (sourceRoute?.condition) {
        return sourceRoute.condition
      }

      // Check if source route has criteria with condition
      if (
        sourceRoute?.criteria &&
        'condition' in sourceRoute.criteria &&
        sourceRoute.criteria.condition
      ) {
        return sourceRoute.criteria.condition
      }

      // Default condition group
      return {
        operator: 'AND',
        conditions: [],
        negate: false,
      }
    },
    [],
  )

  // Helper function to build default values
  const buildDefaultValues = useCallback(
    (
      routeObj: ExtendedContentRouterRule | Partial<ExtendedContentRouterRule>,
      instancesList: Array<RadarrInstance | SonarrInstance>,
      routeContentType: 'radarr' | 'sonarr',
    ) => {
      // Find the selected instance to get default values if needed
      const selectedInst = instancesList.find(
        (inst) => inst.id === routeObj?.target_instance_id,
      )

      return {
        name:
          routeObj?.name ||
          `New ${routeContentType === 'radarr' ? 'Movie' : 'Show'} Route`,
        condition: getInitialConditionValue(routeObj),
        target_instance_id:
          routeObj?.target_instance_id ||
          (instancesList.length > 0 ? instancesList[0].id : 0),
        root_folder: routeObj?.root_folder || '',
        quality_profile:
          routeObj?.quality_profile !== undefined &&
          routeObj?.quality_profile !== null
            ? routeObj.quality_profile.toString()
            : '',
        tags: routeObj?.tags || [],
        enabled: routeObj?.enabled !== false,
        order: routeObj?.order ?? 50,
        // For search_on_add, default to the instance setting or true if not set
        search_on_add:
          routeObj?.search_on_add !== undefined &&
          routeObj?.search_on_add !== null
            ? routeObj.search_on_add
            : selectedInst?.searchOnAdd !== undefined
              ? selectedInst.searchOnAdd
              : true,
        // For season_monitoring (Sonarr only), default to the instance setting or 'all' if not set
        season_monitoring:
          routeContentType === 'sonarr'
            ? routeObj?.season_monitoring ||
              (selectedInst && 'seasonMonitoring' in selectedInst
                ? selectedInst.seasonMonitoring
                : 'all')
            : undefined,
        // For series_type (Sonarr only), default to the instance setting or undefined if not set
        series_type:
          routeContentType === 'sonarr'
            ? routeObj?.series_type ||
              (selectedInst && 'seriesType' in selectedInst
                ? selectedInst.seriesType
                : undefined)
            : undefined,
      }
    },
    [getInitialConditionValue],
  )

  // Create memoized default values to prevent unnecessary form resets
  const defaultValues = useMemo(() => {
    return buildDefaultValues(route, instances, contentType)
  }, [route, buildDefaultValues, instances, contentType])

  // Setup form with validation
  const form = useForm<ConditionalRouteFormValues>({
    resolver: zodResolver(ConditionalRouteFormSchema),
    defaultValues,
    mode: 'all',
  })

  const initializationRef = useRef(false)

  // Subscribe to form value changes and store the latest values
  useEffect(() => {
    // Initial setup
    latestFormValues.current = form.getValues()
    isDirtyRef.current = form.formState.isDirty

    // Create a subscription to all form events
    const subscription = form.watch((_, { name }) => {
      // When any value changes, update our refs
      latestFormValues.current = form.getValues()
      isDirtyRef.current = form.formState.isDirty

      // If condition field changes, trigger validation
      if (name && (name === 'condition' || name.startsWith('condition.'))) {
        setTimeout(() => {
          form.trigger()
        }, 0)
      }
    })

    // This should correctly return an object with an unsubscribe method
    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe()
      }
    }
  }, [form])

  const fetchEvaluatorMetadata = useCallback(async (force = false) => {
    // Skip if already initialized and not forced
    if (initializationRef.current && !force) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/v1/content-router/plugins/metadata')

      if (!response.ok) {
        throw new Error(
          `Failed to fetch evaluator metadata: ${response.status} ${response.statusText}`,
        )
      }

      const data = await response.json()

      if (
        !data.evaluators ||
        !Array.isArray(data.evaluators) ||
        data.evaluators.length === 0
      ) {
        throw new Error(
          'No evaluator metadata available. The server response was empty or invalid.',
        )
      }

      setEvaluatorMetadata(data.evaluators)
      initializationRef.current = true
    } catch (err) {
      console.error('Error fetching evaluator metadata:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load condition options. Please try again.',
      )
      initializationRef.current = false // Allow retries on error
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch evaluator metadata on component mount
  useEffect(() => {
    fetchEvaluatorMetadata()
  }, [fetchEvaluatorMetadata])

  // Scroll to the card when it's a new one
  useEffect(() => {
    if (isNew && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
      // Auto-open the accordion for new items
      setAccordionValue('route')
    }
  }, [isNew])

  // Initial form validation for new cards
  useEffect(() => {
    if (isNew && !hasInitializedForm.current) {
      setTimeout(() => {
        form.trigger()
        hasInitializedForm.current = true
      }, 0)
    }
  }, [form, isNew])

  // Reset form only when route ID changes or saving state changes
  useEffect(() => {
    // Get current route ID
    const currentRouteId = getRouteId(route, isNew)

    // Only reset form if route ID changed (actual different route) or initial load
    const shouldResetForm =
      currentRouteId !== routeIdRef.current || !hasInitializedForm.current

    // Update route ID ref
    routeIdRef.current = currentRouteId

    // Don't reset if saving is in progress
    if (isSavingRef.current) {
      return
    }

    // Only reset if route actually changed to prevent toast-induced resets
    if (shouldResetForm && !isNew) {
      form.reset(buildDefaultValues(route, instances, contentType))
      setLocalTitle(route?.name || '')
      hasInitializedForm.current = true
    }
  }, [
    route,
    isNew,
    form,
    instances,
    contentType,
    getRouteId,
    buildDefaultValues,
  ])

  const handleTitleChange = useCallback(
    (title: string) => {
      form.setValue('name', title, {
        shouldDirty: true,
        shouldValidate: true,
      })
      setLocalTitle(title)
      setIsEditing(false)
    },
    [form],
  )

  const handleToggleEnabled = useCallback(async () => {
    if (
      !('id' in route) ||
      !onToggleEnabled ||
      route.enabled === undefined ||
      route.id === undefined ||
      route.id === null
    )
      return

    // Set the new enabled state
    const newEnabledState = !route.enabled

    // Optimistically update both form and local state
    form.setValue('enabled', newEnabledState, { shouldDirty: false })

    try {
      await onToggleEnabled(route.id, newEnabledState)
    } catch (error) {
      // Revert on error
      form.setValue('enabled', route.enabled, { shouldDirty: false })
    }
  }, [route, onToggleEnabled, form])

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
        // Clear tags because they are instance-specific
        form.setValue('tags', [], { shouldDirty: true })

        // Update the advanced settings based on the selected instance
        const newSelectedInstance = instances.find(
          (inst) => inst.id === instanceId,
        )
        if (newSelectedInstance) {
          // Set search_on_add default from the selected instance, but only if not already changed by user
          if (!form.formState.dirtyFields.search_on_add) {
            form.setValue(
              'search_on_add',
              newSelectedInstance.searchOnAdd !== undefined
                ? newSelectedInstance.searchOnAdd
                : true,
              { shouldDirty: false },
            )
          }

          // For Sonarr, set season_monitoring default, but only if not already changed by user
          if (contentType === 'sonarr') {
            if (!form.formState.dirtyFields.season_monitoring) {
              if (
                'seasonMonitoring' in newSelectedInstance &&
                newSelectedInstance.seasonMonitoring
              ) {
                form.setValue(
                  'season_monitoring',
                  newSelectedInstance.seasonMonitoring,
                  { shouldDirty: false },
                )
              } else {
                form.setValue('season_monitoring', 'all', {
                  shouldDirty: false,
                })
              }
            }
            // Set series_type default, but only if not already changed by user
            if (!form.formState.dirtyFields.series_type) {
              if (
                'seriesType' in newSelectedInstance &&
                newSelectedInstance.seriesType
              ) {
                form.setValue('series_type', newSelectedInstance.seriesType, {
                  shouldDirty: false,
                })
              }
            }
          }
        }
      }
    },
    [form, instances, contentType],
  )

  const targetInstanceId = useWatch({
    control: form.control,
    name: 'target_instance_id',
  })

  const selectedInstance = useMemo(
    () => instances.find((inst) => inst.id === targetInstanceId),
    [instances, targetInstanceId],
  )

  // We don't need this effect as the same logic is already in handleInstanceChange
  // and will be triggered when a new instance is selected

  // Handle form submission
  const handleSubmit = async (data: ConditionalRouteFormValues) => {
    // Set flag to indicate save in progress to prevent form state issues
    isSavingRef.current = true

    try {
      // For new routes (creating a route)
      if (isNew) {
        const routeData: ContentRouterRuleUpdate = {
          name: data.name,
          target_type: contentType,
          target_instance_id: data.target_instance_id,
          quality_profile: data.quality_profile
            ? Number(data.quality_profile)
            : undefined,
          root_folder: data.root_folder,
          tags: data.tags || [],
          enabled: data.enabled,
          order: data.order,
          condition: Array.isArray(data.condition?.conditions)
            ? (data.condition as ConditionGroup)
            : { operator: 'AND', conditions: [], negate: false },
          search_on_add:
            data.search_on_add === null ? undefined : data.search_on_add,
          season_monitoring:
            contentType === 'sonarr' ? data.season_monitoring : undefined,
          series_type:
            contentType === 'sonarr' && data.series_type
              ? data.series_type
              : undefined,
        }

        await onSave(routeData)
      }
      // For existing routes (updating a route)
      else {
        const updatePayload: ContentRouterRuleUpdate = {
          name: data.name,
          condition: Array.isArray(data.condition?.conditions)
            ? (data.condition as ConditionGroup)
            : { operator: 'AND', conditions: [], negate: false },
          target_instance_id: data.target_instance_id,
          quality_profile: data.quality_profile
            ? Number(data.quality_profile)
            : undefined,
          root_folder: data.root_folder,
          tags: data.tags || [],
          enabled: data.enabled,
          order: data.order,
          search_on_add:
            data.search_on_add === null ? undefined : data.search_on_add,
          season_monitoring:
            contentType === 'sonarr' ? data.season_monitoring : undefined,
          series_type:
            contentType === 'sonarr' && data.series_type
              ? data.series_type
              : undefined,
        }

        await onSave(updatePayload)
      }

      // After successful save, reset form state to not be dirty
      // but keep the current values
      form.reset(form.getValues(), {
        keepValues: true,
        keepDirty: false,
      })
      isDirtyRef.current = false
    } catch (error) {
      console.error('Failed to save conditional route:', error)
    } finally {
      // Clear the saving flag after save completes (success or error)
      setTimeout(() => {
        isSavingRef.current = false
      }, 500)
    }
  }

  const handleCancel = () => {
    // Reset the form to its initial values
    form.reset(buildDefaultValues(route, instances, contentType))

    // Reset the local title state
    setLocalTitle(route?.name || '')

    // If it's a new route, call onCancel() to remove it from the local rules array
    if (isNew) {
      onCancel()
    }
  }

  const handleTitleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (localTitle?.trim()) {
      handleTitleChange(localTitle.trim())
    }
  }

  const handleEscape = () => {
    setLocalTitle(route?.name || '')
    setIsEditing(false)
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
      <TagCreationDialog
        open={showTagCreationDialog}
        onOpenChange={setShowTagCreationDialog}
        instanceId={Number(form.watch('target_instance_id'))}
        instanceType={contentType}
        instanceName={selectedInstance?.name}
        onSuccess={() => {
          // Refresh tags after creating a new one
          if (tagsMultiSelectRef.current) {
            tagsMultiSelectRef.current.refetchTags()
          }
        }}
      />

      <Accordion
        type="single"
        collapsible
        className="w-full"
        value={accordionValue}
        onValueChange={setAccordionValue}
      >
        <AccordionItem
          value="route"
          className="border-2 border-border rounded-base overflow-hidden"
        >
          <AccordionTrigger
            className="px-6 py-4 bg-main hover:bg-main hover:no-underline"
            onClick={(e) => {
              if (isEditing) {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
            onKeyDown={(e) => {
              if (isEditing) {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
          >
            <div className="flex justify-between items-center w-full pr-2">
              <div className="group/name inline-flex items-center gap-2 flex-1 min-w-0">
                {isEditing ? (
                  <form
                    onSubmit={handleTitleSubmit}
                    className="flex-1 w-full mr-4"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={localTitle}
                      onChange={(e) => setLocalTitle(e.target.value)}
                      autoFocus
                      className="w-full"
                      disabled={isSaving}
                      onBlur={handleTitleSubmit}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        // Stop propagation for any key events while editing
                        e.stopPropagation()

                        if (e.key === 'Enter') {
                          handleTitleSubmit(e)
                        } else if (e.key === 'Escape') {
                          handleEscape()
                        }
                      }}
                    />
                  </form>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="truncate">{localTitle || 'Unnamed'}</span>
                    {!isSaving && (
                      <span
                        className={cn(
                          'inline-flex items-center justify-center whitespace-nowrap rounded-base text-sm font-base ring-offset-white transition-all gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
                          'text-mtext bg-main border-2 border-border',
                          'h-8 w-8',
                          'opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0 cursor-pointer',
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          setLocalTitle(localTitle)
                          setIsEditing(true)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            setLocalTitle(localTitle)
                            setIsEditing(true)
                          }
                        }}
                        // biome-ignore lint/a11y/useSemanticElements: We need to use span with role="button" to avoid button nesting issues
                        role="button"
                        tabIndex={0}
                        aria-label="Edit title"
                      >
                        <Pen className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Badge
                variant="neutral"
                className={cn(
                  'px-2 py-0.5 h-7 text-sm ml-2 mr-2',
                  form.watch('enabled')
                    ? 'bg-green-500 hover:bg-green-500 text-white'
                    : 'bg-red-500 hover:bg-red-500 text-white',
                )}
              >
                {form.watch('enabled') ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="border-t border-border"
              >
                <div className="p-6 space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Actions section */}
                  <div>
                    <h3 className="font-medium text-text mb-2">Actions</h3>
                    <div className="flex flex-wrap items-center gap-4">
                      {'id' in route && route.id && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleToggleEnabled}
                          disabled={isSaving}
                          variant={form.watch('enabled') ? 'error' : 'noShadow'}
                          className="h-8"
                        >
                          <Power className="h-4 w-4" />
                          <span className="ml-2">
                            {form.watch('enabled') ? 'Disable' : 'Enable'}
                          </span>
                        </Button>
                      )}

                      {/* Save, cancel and delete buttons */}
                      <Button
                        variant="blue"
                        onClick={form.handleSubmit(handleSubmit)}
                        className="flex items-center gap-2 h-8"
                        disabled={
                          !form.formState.isDirty ||
                          !form.formState.isValid ||
                          isSaving
                        }
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

                      {(isNew || form.formState.isDirty) && (
                        <Button
                          variant="cancel"
                          onClick={handleCancel}
                          className="flex items-center gap-2 h-8"
                          disabled={isSaving}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                          <span>Cancel</span>
                        </Button>
                      )}

                      {onRemove && !isNew && (
                        <Button
                          variant="error"
                          size="sm"
                          onClick={onRemove}
                          disabled={isSaving}
                          className="transition-opacity h-8"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          <span>Delete</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Quick help guide for new users */}
                  {isNew && (
                    <Alert variant="default">
                      <div className="flex items-center">
                        <Info className="h-5 w-5 mr-2" />
                        <AlertDescription>
                          <p className="text-sm">
                            Build conditions below to determine when content
                            should be routed to this instance. Start by
                            selecting an evaluator, then a field, followed by an
                            operator, and finally enter a value.
                          </p>
                        </AlertDescription>
                      </div>
                    </Alert>
                  )}

                  {/* Condition Builder Section */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="condition"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <div className="flex items-center space-x-2">
                            <FormLabel className="text-text">
                              Condition Rules
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-text cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    Build conditions that determine when this
                                    route should be used. You can combine
                                    multiple conditions with AND/OR logic.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <FormControl>
                            <div className="border rounded-md p-4 bg-card/50 border-text relative">
                              {loading && (
                                <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-md">
                                  <div className="text-center space-y-2">
                                    <div className="animate-spin h-6 w-6 border-2 border-primary rounded-full border-t-transparent mx-auto" />
                                    <p className="text-sm">
                                      Loading condition options...
                                    </p>
                                  </div>
                                </div>
                              )}
                              {error && (
                                <Alert variant="destructive" className="mb-4">
                                  <AlertCircle className="h-4 w-4" />
                                  <AlertDescription className="flex justify-between items-center">
                                    <span>{error}</span>
                                    <Button
                                      variant="noShadow"
                                      size="sm"
                                      onClick={() => {
                                        setError(null)
                                        fetchEvaluatorMetadata(true) // Force refetch
                                      }}
                                    >
                                      Retry
                                    </Button>
                                  </AlertDescription>
                                </Alert>
                              )}
                              {!evaluatorMetadata.length &&
                              !loading &&
                              !error ? (
                                <div className="text-center py-8">
                                  <p>
                                    No condition types available. Please check
                                    your connection.
                                  </p>
                                  <Button
                                    onClick={(e) => {
                                      e.preventDefault()
                                      fetchEvaluatorMetadata()
                                    }}
                                    variant="noShadow"
                                    size="sm"
                                    className="mt-2"
                                  >
                                    Refresh Conditions
                                  </Button>
                                </div>
                              ) : (
                                <ContentRouterContext.Provider
                                  value={{ contentType }}
                                >
                                  <ConditionGroupComponent
                                    value={
                                      field.value as unknown as IConditionGroup
                                    }
                                    onChange={field.onChange}
                                    evaluatorMetadata={evaluatorMetadata}
                                    genres={genres}
                                    onGenreDropdownOpen={onGenreDropdownOpen}
                                    isLoading={loading}
                                  />
                                </ContentRouterContext.Provider>
                              )}
                            </div>
                          </FormControl>
                          <FormDescription className="text-xs">
                            Content that matches these conditions will be routed
                            to the selected instance
                          </FormDescription>
                          {fieldState.error ? (
                            <p className="text-error">
                              Please set up at least one complete condition with
                              field, operator, and value
                            </p>
                          ) : (
                            <FormMessage />
                          )}
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Instance Selection and Priority Weight */}
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
                    <FormField
                      control={form.control}
                      name="order"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <FormLabel className="text-text">
                                Priority Weight
                              </FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-text cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      Priority weight only affects routing when
                                      multiple rules would send content to the
                                      same instance. In such cases, only the
                                      rule with the highest priority will be
                                      used for that instance. If rules route to
                                      different instances, content will be sent
                                      to all matching instances regardless of
                                      priority.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
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
                            Higher values give this route greater priority
                            (1-100)
                          </FormDescription>
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
                          <FormLabel className="text-text">
                            Root Folder
                          </FormLabel>
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

                  {/* Separator for Advanced Settings */}
                  <Separator className="my-4" />

                  {/* Advanced Settings */}
                  <h3 className="font-medium text-text mb-4">
                    Advanced Settings
                  </h3>

                  {/* Season Monitoring and Series Type - Sonarr Only */}
                  {contentType === 'sonarr' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <FormField
                        control={form.control}
                        name="season_monitoring"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center space-x-2">
                              <FormLabel className="text-text">
                                Season Monitoring
                              </FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-text cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      Season monitoring strategy to use for this
                                      route. Determines which seasons are
                                      monitored for new episodes when series are
                                      added.
                                    </p>
                                    {!isSessionMonitoringEnabled && (
                                      <p className="max-w-xs mt-2 text-sm text-muted-foreground">
                                        Note: Rolling monitoring options (Pilot
                                        Rolling and First Season Rolling)
                                        require Plex Session Monitoring to be
                                        enabled in Utilities.
                                      </p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Select
                              value={field.value || 'all'}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select monitoring strategy" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Object.entries(SONARR_MONITORING_OPTIONS).map(
                                  ([value, label]) => {
                                    const isRollingOption =
                                      value === 'pilot_rolling' ||
                                      value === 'first_season_rolling'
                                    const isDisabled =
                                      isRollingOption &&
                                      !isSessionMonitoringEnabled

                                    return (
                                      <SelectItem
                                        key={value}
                                        value={value}
                                        disabled={isDisabled}
                                        className={
                                          isDisabled
                                            ? 'cursor-not-allowed opacity-50'
                                            : ''
                                        }
                                      >
                                        {label}
                                      </SelectItem>
                                    )
                                  },
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="series_type"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center space-x-2">
                              <FormLabel className="text-text">
                                Series Type
                              </FormLabel>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-4 w-4 text-text cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      Series type to use when adding content to
                                      Sonarr. Overrides the default series type
                                      set on the instance.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <Select
                              value={field.value || undefined}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Use instance default" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">
                                  Use instance default
                                </SelectItem>
                                <SelectItem value="standard">
                                  Standard
                                </SelectItem>
                                <SelectItem value="anime">Anime</SelectItem>
                                <SelectItem value="daily">Daily</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Search on Add and Tags in same row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {/* Search on Add */}
                    <FormField
                      control={form.control}
                      name="search_on_add"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center space-x-2">
                            <FormLabel className="text-text">
                              Search on Add
                            </FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-text cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    When enabled, content will be automatically
                                    searched for when added. Overrides the
                                    default setting configured on the instance.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex h-10 items-center gap-2 px-3 py-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                aria-label="Search on Add"
                              />
                            </FormControl>
                            <span className="text-sm text-text text-muted-foreground">
                              Automatically search for content when added
                            </span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Tags */}
                    <FormField
                      control={form.control}
                      name="tags"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center space-x-2">
                            <FormLabel className="text-text">Tags</FormLabel>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-4 w-4 text-text cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    Add tags to content that matches this route.
                                    Tags will be applied when content is added
                                    to the target instance.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex gap-2 items-center w-full">
                            <TagsMultiSelect
                              ref={tagsMultiSelectRef}
                              field={field}
                              instanceId={Number(
                                form.watch('target_instance_id'),
                              )}
                              instanceType={contentType}
                              isConnectionValid={true}
                            />

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="noShadow"
                                    size="icon"
                                    className="flex-shrink-0"
                                    onClick={() =>
                                      setShowTagCreationDialog(true)
                                    }
                                    disabled={!selectedInstance?.id}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Create a new tag</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </form>
            </Form>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

export default AccordionRouteCard
