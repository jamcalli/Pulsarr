// src/client/features/content-router/components/conditional-route-card.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Slider } from '@/components/ui/slider';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ConditionalRouteFormSchema,
  type ConditionalRouteFormValues,
  type IConditionGroup,
  type ICondition,
} from '@/features/content-router/schemas/content-router.schema';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import type { ContentRouterRule, ContentRouterRuleUpdate } from '@root/schemas/content-router/content-router.schema';
import RouteCardHeader from '@/components/ui/route-card-header';
import { AlertCircle, HelpCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ConditionGroupComponent from './condition-group';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EvaluatorMetadata } from './condition-builder';

// Define criteria interface to match backend schema
interface Criteria {
  condition?: IConditionGroup;
  genre?: string | string[];
  year?: number | number[] | { min?: number; max?: number };
  originalLanguage?: string | string[];
  users?: string | string[];
  [key: string]: any;
}

// Extended ContentRouterRule to include criteria and type
interface ExtendedContentRouterRule extends ContentRouterRule {
  type?: string;
  criteria?: Criteria;
  condition?: IConditionGroup;
}

interface ConditionalRouteCardProps {
  route: ExtendedContentRouterRule | Partial<ExtendedContentRouterRule>;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (data: ContentRouterRule | ContentRouterRuleUpdate) => Promise<void>;
  onRemove?: () => void;
  onToggleEnabled?: (id: number, enabled: boolean) => Promise<void>;
  isSaving: boolean;
  isTogglingState?: boolean;
  instances: any[];
  genres?: string[];
  onGenreDropdownOpen?: () => Promise<void>;
  contentType: 'radarr' | 'sonarr';
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
  genres = [],
  onGenreDropdownOpen,
  contentType,
}: ConditionalRouteCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [evaluatorMetadata, setEvaluatorMetadata] = useState<EvaluatorMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create a default initial condition group for new routes
  const getInitialConditionValue = useCallback((): IConditionGroup => {
    // Check if route has condition
    if (route?.condition) {
      return route.condition;
    }
    
    // Check if route has criteria with condition
    if (route?.criteria && 'condition' in route.criteria && route.criteria.condition) {
      return route.criteria.condition;
    }
    
    // Default condition group
    return {
      operator: 'AND',
      conditions: [],
      negate: false,
    };
  }, [route]);

  // Setup form with validation
  const form = useForm<ConditionalRouteFormValues>({
    resolver: zodResolver(ConditionalRouteFormSchema),
    defaultValues: {
      name: route?.name || `New ${contentType === 'radarr' ? 'Movie' : 'Show'} Route`,
      condition: getInitialConditionValue(),
      target_instance_id: route?.target_instance_id || (instances.length > 0 ? instances[0].id : 0),
      root_folder: route?.root_folder || '',
      quality_profile: route?.quality_profile !== undefined && route?.quality_profile !== null
        ? route.quality_profile.toString()
        : '',
      enabled: route?.enabled !== false,
      order: route?.order ?? 50,
    },
    mode: 'all',
  });

  // Enhanced function to fetch evaluator metadata with error handling
  const fetchEvaluatorMetadata = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/v1/content-router/plugins/metadata');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch evaluator metadata: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.evaluators || !Array.isArray(data.evaluators) || data.evaluators.length === 0) {
        throw new Error('No evaluator metadata available. The server response was empty or invalid.');
      }
      
      setEvaluatorMetadata(data.evaluators);
      
      // Initialize the condition if needed
      const formValues = form.getValues();
      
      if (!formValues.condition || !formValues.condition.conditions || formValues.condition.conditions.length === 0) {
        // Create a default condition using the first evaluator
        const firstEvaluator = data.evaluators[0];
        const firstField = firstEvaluator.supportedFields[0]?.name;
        let firstOperator = '';
        let initialValue: any = '';
        
        if (firstField && firstEvaluator.supportedOperators?.[firstField]) {
          const operators = firstEvaluator.supportedOperators[firstField];
          if (operators.length > 0) {
            firstOperator = operators[0].name;
            
            // Set appropriate default value based on type
            const valueType = operators[0].valueTypes?.[0];
            if (valueType === 'number') initialValue = 0;
            else if (valueType === 'string[]' || valueType === 'number[]') initialValue = [];
            else if (valueType === 'object') initialValue = { min: undefined, max: undefined };
          }
        }
        
        // Create initial condition with valid data
        const initialCondition: IConditionGroup = {
          operator: 'AND',
          conditions: [{
            field: firstField || '',
            operator: firstOperator || '',
            value: initialValue,
            negate: false
          }],
          negate: false
        };
        
        form.setValue('condition', initialCondition, { shouldValidate: true });
      }
    } catch (err) {
      console.error('Error fetching evaluator metadata:', err);
      setError(err instanceof Error ? err.message : 'Failed to load condition options. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [form, getInitialConditionValue]);

  // Fetch evaluator metadata on component mount
  useEffect(() => {
    fetchEvaluatorMetadata();
  }, [fetchEvaluatorMetadata]);

  // Scroll to the card when it's a new one
  useEffect(() => {
    if (isNew && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isNew]);

  // Initial form validation for new cards
  useEffect(() => {
    if (isNew) {
      setTimeout(() => form.trigger(), 0);
    }
  }, [form, isNew]);

  // Reset form when route changes (for editing)
  useEffect(() => {
    if (!isNew && (route.id !== undefined)) {
      form.reset({
        name: route?.name || `New ${contentType === 'radarr' ? 'Movie' : 'Show'} Route`,
        condition: getInitialConditionValue(),
        target_instance_id: route?.target_instance_id || (instances.length > 0 ? instances[0].id : 0),
        root_folder: route?.root_folder || '',
        quality_profile: route?.quality_profile !== undefined && route?.quality_profile !== null
          ? route.quality_profile.toString()
          : '',
        enabled: route?.enabled !== false,
        order: route?.order ?? 50,
      });
    }
  }, [route, isNew, form, getInitialConditionValue, instances, contentType]);

  const setTitleValue = useCallback(
    (title: string) => {
      form.setValue('name', title, { shouldDirty: true });
    },
    [form],
  );

  const handleToggleEnabled = async () => {
    if (onToggleEnabled && 'id' in route && route.id) {
      await onToggleEnabled(route.id, !form.watch('enabled'));
    }
  };

  const handleInstanceChange = useCallback(
    (value: string) => {
      const instanceId = Number.parseInt(value, 10);
      if (!Number.isNaN(instanceId)) {
        form.setValue('target_instance_id', instanceId);
        form.setValue('root_folder', '', { shouldDirty: true });
        form.setValue('quality_profile', '', {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    },
    [form],
  );

  const getSelectedInstance = useCallback(() => {
    return instances.find(
      (inst) => inst.id === form.watch('target_instance_id'),
    );
  }, [instances, form]);

  // Get the selected instance
  const selectedInstance = getSelectedInstance();

  // Handle form submission
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
          condition: data.condition, // Use condition directly
          created_at: '', // This will be set by the backend
          updated_at: '', // This will be set by the backend
        };

        await onSave(routeData);
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
        };

        await onSave(updatePayload);
      }
    } catch (error) {
      console.error('Failed to save conditional route:', error);
      toast({
        title: 'Error',
        description: `Failed to save conditional route: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    onCancel();
  };

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
                          Start by selecting an evaluator, then a field, followed by an operator, and finally enter a value.
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
                                genres={genres}
                                onGenreDropdownOpen={onGenreDropdownOpen}
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
  );
};

export default ConditionalRouteCard;