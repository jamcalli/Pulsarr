import { useState, useEffect, useRef, useCallback } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { Button } from '@/components/ui/button'
import { Plus, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateTagDialog } from './create-tag-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { TagsResponse } from '@root/schemas/radarr/get-tags.schema'
import type { Error } from '@root/schemas/radarr/get-quality-profiles.schema'

interface TagOption {
  label: string
  value: string
}

interface TagsMultiSelectProps {
  field: ControllerRenderProps<any, any>
  instanceId: number
  instanceType: 'radarr' | 'sonarr'
  isConnectionValid: boolean
  disabled?: boolean
}

/**
 * A component for selecting multiple tags with the ability to create new ones.
 * 
 * This component stores the tag IDs (as strings) in the form data for proper
 * integration with Radarr and Sonarr APIs.
 * 
 * @example
 * <TagsMultiSelect
 *   field={field}
 *   instanceId={instanceId}
 *   instanceType="radarr"
 *   isConnectionValid={isConnectionValid}
 * />
 */
export function TagsMultiSelect({
  field,
  instanceId,
  instanceType,
  isConnectionValid,
  disabled = false
}: TagsMultiSelectProps) {

  // State hooks
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tags, setTags] = useState<TagOption[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Ref hooks
  const pendingValueRef = useRef<string[] | null>(null)
  const tagsLoadedRef = useRef(false)
  const updatingFromTagCreationRef = useRef(false)
  
  // Define all handler functions with useCallback
  
  // Function to handle value change for tag selection
  const handleValueChange = useCallback((values: string[]) => {
    // If we're updating from tag creation, use a special handler that doesn't mark the form as dirty
    if (updatingFromTagCreationRef.current) {
      // Just update the control's value without marking form as dirty
      // Always store the tag IDs (as strings), not the labels
      field.value = values;
      return;
    }
    
    // Normal user selection behavior - always store tag IDs (as strings)
    field.onChange(values);
  }, [field]);

  // Function to fetch tags from the server
  const fetchTags = useCallback(async () => {
    if (!isConnectionValid || instanceId <= 0) return
    
    setIsLoading(true)
    setLoadError(null)
    
    try {
      // Use a shorter minimum loading time (250ms) to match other selects
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 250))
      
      const response = await fetch(`/v1/${instanceType}/tags?instanceId=${instanceId}`)
      const [data] = await Promise.all([response.json() as Promise<TagsResponse | Error>, minimumLoadingTime])
      
      if ('success' in data && data.success && Array.isArray(data.tags)) {
        const tagOptions = data.tags.map(tag => ({
          label: tag.label,
          value: tag.id.toString()
        }))
        setTags(tagOptions)
        tagsLoadedRef.current = true
      } else {
        console.error(`Failed to fetch ${instanceType} tags:`, data)
        const errorMessage = 'message' in data ? data.message : `Failed to fetch ${instanceType} tags`
        setLoadError(errorMessage)
      }
    } catch (error) {
      console.error(`Error fetching ${instanceType} tags:`, error)
      setLoadError(`Error loading tags: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }, [isConnectionValid, instanceId, instanceType]);
  
  // Function to handle retry button click
  const handleRetryLoad = useCallback(() => {
    fetchTags()
  }, [fetchTags]);
  
  // Function to handle successful tag creation
  const handleTagCreated = useCallback(() => {
    // Set the flag to prevent marking the form as dirty when we update tags
    updatingFromTagCreationRef.current = true;
    // Refetch tags - the toast is handled inside the CreateTagDialog component
    fetchTags();
    // Reset the flag after a short delay (after the component has re-rendered with new tags)
    setTimeout(() => {
      updatingFromTagCreationRef.current = false;
    }, 100);
  }, [fetchTags]);
  
  // Function to get default values for the MultiSelect
  const getDefaultValues = useCallback(() => {
    if (!field.value) return []
    
    if (Array.isArray(field.value)) {
      // All values should be strings (tag IDs)
      return field.value
    } else if (field.value) {
      // Single value
      return [field.value]
    }
    
    return []
  }, [field.value]);
  
  // Effect to handle initial values when tags load - mostly a placeholder now
  // since we're always using tag IDs directly
  useEffect(() => {
    if (tags.length > 0 && pendingValueRef.current) {
      tagsLoadedRef.current = true
      
      // We're now directly using the tag IDs, so we can just pass through
      field.onChange(pendingValueRef.current)
      
      // Clear the pending value
      pendingValueRef.current = null
    }
  }, [tags, field]);
  
  // Effect to fetch tags on mount/dependency changes
  useEffect(() => {
    fetchTags()
  }, [fetchTags]);
  
  // Effect to store initial field value as pending if tags haven't loaded
  useEffect(() => {
    // Only store initial value if we have a value and tags aren't loaded yet
    if (field.value && !tagsLoadedRef.current) {
      if (Array.isArray(field.value)) {
        // Already an array of tag IDs, store directly
        pendingValueRef.current = field.value
      } else if (field.value) {
        // Handle single value
        pendingValueRef.current = [field.value]
      }
    }
  }, [field.value]);
  
  // The component always renders the container with the add button
  // Only the select itself will show loading/error states
  
  return (
    <div className="flex gap-2 items-center w-full">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="noShadow"
              size="icon"
              className="flex-shrink-0"
              onClick={() => setShowCreateDialog(true)}
              disabled={!isConnectionValid || disabled}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Create a new tag</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <div className="flex-1 min-w-0">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : loadError ? (
          <div className="flex items-center text-sm text-red-500 p-2 border border-red-300 rounded-md bg-red-50 dark:bg-red-950 dark:border-red-800 w-full">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span className="flex-grow">{loadError}</span>
            <Button 
              variant="noShadow"
              size="sm" 
              onClick={handleRetryLoad}
              className="ml-2 flex-shrink-0"
            >
              Retry
            </Button>
          </div>
        ) : (
          <MultiSelect
            options={tags}
            onValueChange={handleValueChange}
            value={getDefaultValues()}
            placeholder="Select tags"
            disabled={!isConnectionValid || disabled}
            modalPopover={true}
            maxCount={2}
          />
        )}
      </div>
      
      <CreateTagDialog
        open={showCreateDialog} 
        onOpenChange={setShowCreateDialog}
        instanceId={instanceId}
        instanceType={instanceType}
        onSuccess={handleTagCreated}
      />
    </div>
  )
}