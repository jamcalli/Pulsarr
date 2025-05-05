import { useState, useEffect, useRef, useCallback } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
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

  // Ref hooks
  const pendingValueRef = useRef<string[] | null>(null)
  const tagsLoadedRef = useRef(false)
  
  // Handle tag selection changes
  const handleValueChange = useCallback((values: string[]) => {
    field.onChange(values);
  }, [field]);

  // Fetch tags from the server
  const fetchTags = useCallback(async () => {
    if (!isConnectionValid || instanceId <= 0) return
    
    setIsLoading(true)
    setLoadError(null)
    
    try {
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
  
  // Handle retry button click
  const handleRetryLoad = useCallback(() => {
    fetchTags()
  }, [fetchTags]);

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
  
  // Handle initial values when tags load
  useEffect(() => {
    if (tags.length > 0 && pendingValueRef.current) {
      tagsLoadedRef.current = true
      field.onChange(pendingValueRef.current)
      pendingValueRef.current = null
    }
  }, [tags, field]);
  
  // Fetch tags on mount
  useEffect(() => {
    fetchTags()
  }, [fetchTags]);
  
  // Store initial field value as pending if tags haven't loaded
  useEffect(() => {
    if (field.value && !tagsLoadedRef.current) {
      if (Array.isArray(field.value)) {
        pendingValueRef.current = field.value
      } else if (field.value) {
        pendingValueRef.current = [field.value]
      }
    }
  }, [field.value]);
  return (
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
  )
}