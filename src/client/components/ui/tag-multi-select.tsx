import { AlertCircle, Plus } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { Skeleton } from '@/components/ui/skeleton'
import { TagCreationDialog } from '@/components/ui/tag-creation-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'

interface TagOption {
  label: string
  value: string
}

interface TagsMultiSelectProps {
  field: ControllerRenderProps<any, any>
  instanceId: number
  instanceType: 'radarr' | 'sonarr'
  isConnectionValid: boolean
  instanceName?: string
  disabled?: boolean
}

export interface TagsMultiSelectRef {
  refetchTags: () => Promise<void>
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
export const TagsMultiSelect = forwardRef<TagsMultiSelectRef, TagsMultiSelectProps>(({
  field,
  instanceId,
  instanceType,
  isConnectionValid,
  instanceName,
  disabled = false
}, ref) => {

  // State hooks
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tags, setTags] = useState<TagOption[]>([])
  const [showTagCreationDialog, setShowTagCreationDialog] = useState(false)

  // Ref hooks
  const pendingValueRef = useRef<string[] | null>(null)
  const tagsLoadedRef = useRef(false)
  const isInternalUpdateRef = useRef(false)

  // Handle tag selection changes
  const handleValueChange = useCallback((values: string[]) => {
    // Set flag to indicate this update is from user interaction
    isInternalUpdateRef.current = true;
    field.onChange(values);
    // Reset flag after update
    setTimeout(() => {
      isInternalUpdateRef.current = false;
    }, 0);
  }, [field]);

  // Ref to store the current AbortController
  const abortControllerRef = useRef<AbortController | null>(null);

  // Function to abort any ongoing request
  const abortRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Fetch tags from the server
  const fetchTags = useCallback(async () => {
    if (!isConnectionValid || instanceId <= 0) {
      setIsLoading(false)
      setLoadError(null)
      setTags([])
      return
    }

    // Cancel any previous request
    abortRequest();

    // Create a new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal

    setIsLoading(true)
    setLoadError(null)

    try {
      // No minimum loading time - match the timing of quality profile and root folder selects
      // Both use natural loading timing based on network requests

      const response = await fetch(
        api(`/v1/${instanceType}/tags?instanceId=${instanceId}`),
        { signal }
      )

      if (!response.ok) {
        // If it's a 404 error and we had previous values, clear them and continue
        if (response.status === 404 && field.value && Array.isArray(field.value) && field.value.length > 0) {
          // Reset field value since the tags no longer exist
          isInternalUpdateRef.current = true;
          field.onChange([]);
          setTimeout(() => {
            isInternalUpdateRef.current = false;
          }, 0);

          // Show a toast notification instead of blocking the UI
          toast.error("Previously selected tags no longer exist and have been cleared.");

          setIsLoading(false);
          setTags([]);
          return;
        }
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if ('success' in data && data.success && Array.isArray(data.tags)) {
        const tagOptions = data.tags.map((tag: { id: number; label: string }) => ({
          label: tag.label,
          value: tag.id.toString()
        }))
        if (!signal.aborted) {
          setTags(tagOptions)
          tagsLoadedRef.current = true
        }
      } else {
        console.error(`Failed to fetch ${instanceType} tags:`, data)
        const errorMessage = 'message' in data ? data.message : `Failed to fetch ${instanceType} tags`
        if (!signal.aborted) {
          setLoadError(errorMessage as string)
        }
      }
    } catch (error) {
      // Don't log abort errors - these are expected when component unmounts during fetch
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error(`Error fetching ${instanceType} tags:`, error)
        if (!signal.aborted) {
          setLoadError(`Error loading tags: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    } finally {
      if (!signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [isConnectionValid, instanceId, instanceType]);

  // Cancel any in-flight requests on unmount
  useEffect(() => () => abortRequest(), [abortRequest]);

  // Get default values for the MultiSelect
  const getDefaultValues = useCallback(() => {
    if (!field.value) return []

    if (Array.isArray(field.value)) {
      return field.value
    } else if (field.value) {
      return [field.value]
    }

    return []
  }, [field.value]);

  // Update pending value reference when the field value changes from parent component
  // but not when we internally updated it
  useEffect(() => {
    // Skip if we triggered the update internally via handleValueChange
    if (isInternalUpdateRef.current) return;

    // Skip if we already loaded tags - we only care about initialization
    if (tagsLoadedRef.current) return;

    if (field.value) {
      if (Array.isArray(field.value)) {
        pendingValueRef.current = field.value;
      } else {
        pendingValueRef.current = [field.value];
      }
    } else {
      // Handle the case where the field value is cleared from outside
      pendingValueRef.current = [];
    }
  }, [field.value]);

  // Handle initialization of tags and values
  useEffect(() => {
    // Only try to set values when tags are loaded and we have pending values
    if (tags.length > 0 && pendingValueRef.current !== null) {
      // First mark that we've loaded tags to prevent re-processing
      tagsLoadedRef.current = true;

      if (pendingValueRef.current.length > 0) {
        // Verify tags exist in options before setting value
        const validTagValues = pendingValueRef.current.filter(tagId =>
          tags.some(tag => tag.value === tagId)
        );

        if (validTagValues.length > 0) {
          // Set the field value without triggering form dirty state
          isInternalUpdateRef.current = true;
          field.onChange(validTagValues);
          setTimeout(() => {
            isInternalUpdateRef.current = false;
          }, 0);
        }
      }

      // Clear pending values after processing
      pendingValueRef.current = null;
    }
  }, [tags, field]);

  // Expose the fetchTags method through ref
  useImperativeHandle(ref, () => ({
    refetchTags: async () => {
      await fetchTags()
    }
  }), [fetchTags]);

  // Fetch tags on mount
  useEffect(() => {
    fetchTags()
  }, [fetchTags]);

  const createButtonDisabled = !isConnectionValid || disabled || isLoading || !!loadError

  return (
    <>
      <div className={`flex gap-2 items-center w-full ${(!isConnectionValid || disabled) ? 'cursor-not-allowed' : ''}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="noShadow"
              size="icon"
              className="shrink-0"
              onClick={() => setShowTagCreationDialog(true)}
              disabled={createButtonDisabled}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Create a new tag</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : loadError ? (
            <Alert variant="error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
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
      </div>

      <TagCreationDialog
        open={showTagCreationDialog}
        onOpenChange={setShowTagCreationDialog}
        instanceId={instanceId}
        instanceType={instanceType}
        instanceName={instanceName}
        onSuccess={fetchTags}
      />
    </>
  )
})