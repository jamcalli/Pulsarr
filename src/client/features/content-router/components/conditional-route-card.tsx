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
  type ICondition,
} from '@/features/content-router/schemas/content-router.schema'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import type {
  ContentRouterRule,
  ContentRouterRuleUpdate,
} from '@root/schemas/content-router/content-router.schema'
import type { RadarrInstance } from '@root/types/radarr.types'
import type { SonarrInstance } from '@root/types/sonarr.types'
import RouteCardHeader from '@/components/ui/route-card-header'
import { AlertCircle, HelpCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConditionGroupComponent from './condition-group'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { EvaluatorMetadata } from './condition-builder'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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

  // Enhanced fetchEvaluatorMetadata with better initialization
  const fetchEvaluatorMetadata = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch('/v1/content-router/plugins/metadata', {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch evaluator metadata: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.evaluators || !Array.isArray(data.evaluators) || data.evaluators.length === 0) {
        throw new Error('No evaluator metadata available. The server response was empty or invalid.');
      }
      
      setEvaluatorMetadata(data.evaluators);
      
      // Now immediately create at least one initial condition with actual values
      const allFields: string[] = [];
      
      // Collect all available fields from metadata
      for (const evaluator of data.evaluators) {
        if (evaluator.supportedFields) {
          for (const field of evaluator.supportedFields) {
            if (!allFields.includes(field.name)) {
              allFields.push(field.name);
            }
          }
        }
      }
      
      if (allFields.length > 0) {
        // Get the current form values
        const formValues = form.getValues();
        const hasExistingConditions = formValues.condition?.conditions?.length > 0;
        
        // Check if we need to update any condition fields
        let needsUpdate = false;
        let updatedConditions: (ICondition | IConditionGroup)[] = [];
        
        if (hasExistingConditions) {
          // Process existing conditions to ensure they have valid fields
          updatedConditions = formValues.condition.conditions.map(condition => {
            if (
              condition && 
              typeof condition === 'object' && 
              !('conditions' in condition) && 
              (!condition.field || allFields.indexOf(condition.field) === -1)
            ) {
              needsUpdate = true;
              
              // Get first field and its operators
              const firstField = allFields[0];
              let firstOperator = '';
              
              // Find first available operator for this field
              for (const evaluator of data.evaluators) {
                if (evaluator.supportedOperators?.[firstField]) {
                  const operators = evaluator.supportedOperators[firstField];
                  if (operators.length > 0) {
                    firstOperator = operators[0].name;
                    break;
                  }
                }
              }
              
              // Return updated condition with valid field and operator
              return {
                ...(condition as ICondition),
                field: firstField,
                operator: firstOperator,
                value: ''
              };
            }
            return condition;
          });
          
          if (needsUpdate) {
            // Update the form with properly initialized conditions
            form.setValue('condition', {
              ...formValues.condition,
              conditions: updatedConditions
            }, { shouldValidate: true });
          }
        } else {
          // If no conditions exist, create a new one with the first field and operator
          const firstField = allFields[0];
          let firstOperator = '';
          
          // Find first available operator for this field
          for (const evaluator of data.evaluators) {
            if (evaluator.supportedOperators?.[firstField]) {
              const operators = evaluator.supportedOperators[firstField];
              if (operators.length > 0) {
                firstOperator = operators[0].name;
                break;
              }
            }
          }
          
          // Create initial condition with valid field and operator
          const initialCondition: IConditionGroup = {
            operator: 'AND',
            conditions: [
              {
                field: firstField,
                operator: firstOperator,
                value: '',
                negate: false
              }
            ],
            negate: false
          };
          
          // Set the form value with this initial condition
          form.setValue('condition', initialCondition, { shouldValidate: true });
        }
      }
    } catch (err) {
      console.error('Error fetching evaluator metadata:', err);
      setError(err instanceof Error ? err.message : 'Failed to load condition options. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Improved getInitialConditionValue to use evaluator metadata if available
  const getInitialConditionValue = useCallback((): IConditionGroup => {
    // Check if route has criteria with condition
    if (route?.criteria && 'condition' in route.criteria && route.criteria.condition) {
      return route.criteria.condition as IConditionGroup;
    }
    
    // Get available fields from evaluator metadata
    const availableFields: string[] = [];
    let firstOperator = '';
    
    if (evaluatorMetadata.length > 0) {
      // Collect all available fields
      for (const evaluator of evaluatorMetadata) {
        if (evaluator.supportedFields) {
          for (const field of evaluator.supportedFields) {
            if (!availableFields.includes(field.name)) {
              availableFields.push(field.name);
            }
          }
        }
      }
      
      // Try to get first operator for the first field
      if (availableFields.length > 0) {
        const firstField = availableFields[0];
        for (const evaluator of evaluatorMetadata) {
          if (evaluator.supportedOperators?.[firstField]) {
            const operators = evaluator.supportedOperators[firstField];
            if (operators.length > 0) {
              firstOperator = operators[0].name;
              break;
            }
          }
        }
      }
    }
    
    // Pick the first available field if any
    const initialField = availableFields.length > 0 ? availableFields[0] : '';
    
    // Default to an empty AND condition group with a proper initial field and operator
    const initialCondition: IConditionGroup = {
      operator: 'AND',
      conditions: [
        {
          field: initialField,
          operator: firstOperator,
          value: '',
          negate: false,
        }
      ],
      negate: false,
    };
    
    return initialCondition;
  }, [route, evaluatorMetadata]);

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

  // Fetch evaluator metadata on component mount
  useEffect(() => {
    fetchEvaluatorMetadata();
  }, []);

  // Make sure the form has valid conditions when metadata changes
  useEffect(() => {
    if (evaluatorMetadata.length > 0) {
      // Check if form needs initialization with metadata-based values
      const formValues = form.getValues();
      const hasConditions = formValues.condition?.conditions?.length > 0;
      
      if (!hasConditions) {
        // If no conditions, initialize with the values from getInitialConditionValue
        form.setValue('condition', getInitialConditionValue(), { shouldValidate: true });
      }
    }
  }, [evaluatorMetadata, form, getInitialConditionValue]);

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

                {/* Quick help guide for new users */}
                {isNew && (
                  <Alert variant="default">
                    <div className="flex items-center">
                      <HelpCircle className="h-4 w-4 mr-2" />
                      <AlertDescription>
                        <p className="text-sm">
                          Build conditions below to determine when content should be routed to this instance. 
                          Start by selecting a field, then an operator, and finally enter a value.
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
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-text">
                            Condition Rules
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="noShadow" size="icon" className="h-6 w-6 p-0">
                                  <HelpCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Build conditions that determine when this route should be used. 
                                  You can combine multiple conditions with AND/OR logic.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <div className="border rounded-md p-4 bg-card/50 relative">
                            {loading && (
                              <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-md">
                                <div className="text-center space-y-2">
                                  <div className="animate-spin h-6 w-6 border-2 border-primary rounded-full border-t-transparent mx-auto"></div>
                                  <p className="text-sm">Loading condition options...</p>
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
                                      setError(null);
                                      fetchEvaluatorMetadata();
                                    }}
                                  >
                                    Retry
                                  </Button>
                                </AlertDescription>
                              </Alert>
                            )}
                            {!evaluatorMetadata.length && !loading && !error ? (
                              <div className="text-center py-8">
                                <p>No condition types available. Please check your connection.</p>
                                <Button 
                                  onClick={fetchEvaluatorMetadata}
                                  variant="noShadow" 
                                  size="sm"
                                  className="mt-2"
                                >
                                  Refresh Conditions
                                </Button>
                              </div>
                            ) : (
                              <ConditionGroupComponent
                                value={field.value}
                                onChange={field.onChange}
                                evaluatorMetadata={evaluatorMetadata}
                                isLoading={loading}
                              />
                            )}
                          </div>
                        </FormControl>
                        <FormDescription className="text-xs">
                          Content that matches these conditions will be routed to the selected instance
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
                        <div className="flex items-center space-x-2">
                          <FormLabel className="text-text">
                            Priority Weight
                          </FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="noShadow" size="icon" className="h-6 w-6 p-0">
                                  <HelpCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  Higher values give this route greater priority.
                                  When multiple routes match, the one with the highest priority is used.
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