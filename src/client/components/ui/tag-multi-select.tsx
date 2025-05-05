import { useState, useEffect } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'
import { MultiSelect } from '@/components/ui/multi-select'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
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
  field: ControllerRenderProps<any, 'tags'>
  instanceId: number
  instanceType: 'radarr' | 'sonarr'
  isConnectionValid: boolean
  disabled?: boolean
}

export function TagsMultiSelect({
  field,
  instanceId,
  instanceType,
  isConnectionValid,
  disabled = false
}: TagsMultiSelectProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [tags, setTags] = useState<TagOption[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  
  const fetchTags = async () => {
    setIsLoading(true)
    try {
      // Add a minimum loading time for consistency with other components
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500))
      
      const response = await fetch(`/v1/${instanceType}/tags?instanceId=${instanceId}`)
      const [data] = await Promise.all([response.json() as Promise<TagsResponse | Error>, minimumLoadingTime])
      
      if ('success' in data && data.success && Array.isArray(data.tags)) {
        const tagOptions = data.tags.map(tag => ({
          label: tag.label,
          value: tag.id.toString()
        }))
        setTags(tagOptions)
      } else {
        console.error(`Failed to fetch ${instanceType} tags:`, data)
      }
    } catch (error) {
      console.error(`Error fetching ${instanceType} tags:`, error)
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    if (isConnectionValid && instanceId > 0) {
      fetchTags()
    }
  }, [isConnectionValid, instanceId, instanceType])
  
  if (isLoading) {
    return <Skeleton className="h-10 w-full" />
  }
  
  const handleTagCreated = () => {
    fetchTags()
  }

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
        <MultiSelect
          options={tags}
          onValueChange={(values) => {
            field.onChange(values.map(v => Number(v)))
          }}
          defaultValue={Array.isArray(field.value) 
            ? field.value.map(v => v.toString()) 
            : field.value 
              ? [field.value.toString()] 
              : []
          }
          placeholder="Select tags"
          disabled={!isConnectionValid || disabled}
          modalPopover={true}
          maxCount={2}
        />
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