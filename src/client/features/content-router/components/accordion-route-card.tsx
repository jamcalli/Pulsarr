import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
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
  Loader2,
  Pen,
  Save,
  Trash2,
  X,
  Power,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConditionGroupComponent from '@/features/content-router/components/condition-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  const getInitialConditionValue = useCallback((): ConditionGroup => {
    // Check if route has condition
    if (route?.condition) {
      return route.condition
    }

    // Check if route has criteria with condition
    if (
      route?.criteria &&
      'condition' in route.criteria &&
      route.criteria.condition
    ) {
      return route.criteria.condition
    }

    // Default condition group
    return {
      operator: 'AND',
      conditions: [],
      negate: false,
    }
  }, [route])

  // Create memoized default values to prevent unnecessary form resets
  const defaultValues = useMemo(
    () => ({
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
    }),
    [route, getInitialConditionValue, instances, contentType],
  )

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
    const subscription = form.watch(() => {
      // When any value changes, update our refs
      latestFormValues.current = form.getValues()
      isDirtyRef.current = form.formState.isDirty
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
          route?.quality_profile !== undefined &&
          route?.quality_profile !== null
            ? route.quality_profile.toString()
            : '',
        enabled: route?.enabled !== false,
        order: route?.order ?? 50,
      })
      setLocalTitle(route?.name || '')
      hasInitializedForm.current = true
    }
  }, [
    route,
    isNew,
    form,
    getInitialConditionValue,
    instances,
    contentType,
    getRouteId,
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
      }
    },
    [form],
  )

  const targetInstanceId = useWatch({
    control: form.control,
    name: 'target_instance_id',
  })

  const selectedInstance = useMemo(
    () => instances.find((inst) => inst.id === targetInstanceId),
    [instances, targetInstanceId],
  )

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
          enabled: data.enabled,
          order: data.order,
          condition: Array.isArray(data.condition?.conditions)
            ? (data.condition as ConditionGroup)
            : { operator: 'AND', conditions: [], negate: false },
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
          enabled: data.enabled,
          order: data.order,
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
                        <HelpCircle className="h-4 w-4 mr-2" />
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

                  {/* Weight/Priority Slider */}
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
                                    same instance. In such cases, only the rule
                                    with the highest priority will be used for
                                    that instance. If rules route to different
                                    instances, content will be sent to all
                                    matching instances regardless of priority.
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
