import type {
  CreateTagBody as RadarrCreateTagBody
} from '@root/schemas/radarr/create-tag.schema'
import {
  CreateTagResponseSchema as RadarrCreateTagResponseSchema,
  ErrorSchema as RadarrErrorSchema
} from '@root/schemas/radarr/create-tag.schema'
import type {
  CreateTagBody as SonarrCreateTagBody
} from '@root/schemas/sonarr/create-tag.schema'
import {
  CreateTagResponseSchema as SonarrCreateTagResponseSchema,
  ErrorSchema as SonarrErrorSchema
} from '@root/schemas/sonarr/create-tag.schema'
import { Check, Loader2 } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Status type for tracking the dialog state
type SaveStatus = 'idle' | 'loading' | 'success' | 'error'

// Type conditionals for Radarr and Sonarr
type CreateTagBody<T extends 'radarr' | 'sonarr'> = T extends 'sonarr' 
  ? SonarrCreateTagBody 
  : RadarrCreateTagBody

interface TagCreationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
  instanceType: 'radarr' | 'sonarr'
  instanceName?: string
  onSuccess: () => void
}

/**
 * Displays a modal dialog for creating a new tag in a Radarr or Sonarr instance.
 *
 * Allows users to input a tag name, validates the input, and submits a creation request to the backend. The dialog manages loading, success, and error states, disables interaction during submission, and provides user feedback. On successful creation, the dialog closes and triggers a callback.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Invoked when the dialog's open state changes
 * @param instanceId - Identifier for the target Radarr or Sonarr instance
 * @param instanceType - Specifies the instance type ('radarr' or 'sonarr')
 * @param instanceName - Optional display name for the instance
 * @param onSuccess - Invoked after a tag is successfully created
 */
export function TagCreationDialog({
  open,
  onOpenChange,
  instanceId,
  instanceType,
  instanceName = '',
  onSuccess
}: TagCreationDialogProps) {
  const [tagLabel, setTagLabel] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const tagNameId = useId()
  
  // Handle dialog open state changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && saveStatus !== 'loading') {
      setTagLabel('')
      setSaveStatus('idle')
    }
    
    if (saveStatus !== 'loading') {
      onOpenChange(newOpen)
    }
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!tagLabel.trim()) {
      toast.error('Please enter a tag name')
      return
    }
    
    setSaveStatus('loading')
    
    try {
      const label = tagLabel.trim()
      const requestBody: CreateTagBody<typeof instanceType> = {
        instanceId,
        label
      }
      
      // Execute with minimum loading time for better UX
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 500))
      
      const response = await fetch(`/v1/${instanceType}/create-tag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      await minimumLoadingTime
      
      const raw = await response.text()
      let parsed: unknown
      try {
        parsed = raw ? JSON.parse(raw) : undefined
      } catch {
        parsed = undefined
      }
      
      // Use proper schema parsing instead of manual casting
      const responseSchema = instanceType === 'sonarr' ? SonarrCreateTagResponseSchema : RadarrCreateTagResponseSchema
      const errorSchema = instanceType === 'sonarr' ? SonarrErrorSchema : RadarrErrorSchema
      
      const data = response.ok
        ? (response.status === 204 
            ? { success: true, data: undefined } as const
            : responseSchema.safeParse(parsed))
        : errorSchema.safeParse(parsed ?? { message: response.statusText })
      
      if (response.ok) {
        if (data.success) {
          // Format the instance name for the toast
          const systemType = instanceType === 'radarr' ? 'Radarr' : 'Sonarr';
          const displayName = instanceName 
            ? `${systemType} instance "${instanceName}"`
            : systemType;
            
          toast.success(`Tag "${label}" created successfully in ${displayName}`)
          
          setSaveStatus('success')
          
          // Brief success state before closing
          setTimeout(() => {
            handleOpenChange(false)
            onSuccess()
          }, 250)
        } else {
          throw new Error('Invalid response format')
        }
      } else {
        const message =
          data.success && data.data && 'message' in data.data && typeof data.data.message === 'string'
            ? data.data.message
            : response.statusText || 'Failed to create tag'
        throw new Error(message)
      }
    } catch (error) {
      console.error('Error creating tag:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create tag')
      
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 500)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (saveStatus === 'loading') {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          if (saveStatus === 'loading') {
            e.preventDefault()
          }
        }}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-foreground">Create New Tag</DialogTitle>
            <DialogDescription>
              Enter a name for your new tag. This tag will be created in your {instanceType === 'radarr' ? 'Radarr' : 'Sonarr'} instance.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor={tagNameId} className="text-foreground">Tag Name</Label>
            <Input
              id={tagNameId}
              value={tagLabel}
              onChange={(e) => setTagLabel(e.target.value)}
              placeholder="Enter tag name"
              disabled={saveStatus !== 'idle'}
              className="mt-1"
              autoFocus
            />
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="neutral"
              onClick={() => handleOpenChange(false)}
              disabled={saveStatus !== 'idle'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saveStatus !== 'idle' || !tagLabel.trim()}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {saveStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : saveStatus === 'success' ? (
                <>
                  <Check className="h-4 w-4" />
                  Created!
                </>
              ) : (
                'Create Tag'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}