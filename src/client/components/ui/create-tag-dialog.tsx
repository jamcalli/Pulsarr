import { useState, useEffect } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Check } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { CreateTagBody, CreateTagResponse, Error } from '@root/schemas/radarr/create-tag.schema'

// Set the same minimum loading delay as in plex
const MIN_LOADING_DELAY = 500

// Status type identical to usePlexUser hook
type SaveStatus = 'idle' | 'loading' | 'success' | 'error'

interface CreateTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: number
  instanceType: 'radarr' | 'sonarr'
  onSuccess: () => void
}

export function CreateTagDialog({
  open,
  onOpenChange,
  instanceId,
  instanceType,
  onSuccess
}: CreateTagDialogProps) {
  const { toast } = useToast()
  const [tagLabel, setTagLabel] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  
  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTagLabel('')
      setSaveStatus('idle')
    }
  }, [open])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!tagLabel.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a tag name',
        variant: 'destructive'
      })
      return
    }
    
    setSaveStatus('loading')
    
    try {
      const requestBody: CreateTagBody = {
        instanceId,
        label: tagLabel.trim()
      }
      
      // Create a minimum loading time exactly as in usePlexUser
      const minimumLoadingTime = new Promise(resolve => 
        setTimeout(resolve, MIN_LOADING_DELAY)
      )
      
      // Execute the API request
      const fetchPromise = fetch(`/v1/${instanceType}/create-tag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      // Wait for both the minimum time and the API response, exactly like in usePlexUser
      await Promise.all([fetchPromise, minimumLoadingTime])
        .then(async ([response]) => {
          const data = await response.json() as CreateTagResponse | Error
          
          if (response.ok) {
            toast({
              description: `Tag "${tagLabel}" created successfully in ${instanceType === 'radarr' ? 'Radarr' : 'Sonarr'}`,
              variant: 'default'
            })
            
            setSaveStatus('success')
            
            // Show success state for half the MIN_LOADING_DELAY, exactly as in usePlexUser
            await new Promise(resolve => setTimeout(resolve, MIN_LOADING_DELAY / 2))
            onOpenChange(false)
            onSuccess()
          } else {
            // Properly handle the error response
            const errorMessage = 'message' in data ? data.message : 'Failed to create tag'
            throw new Error(errorMessage)
          }
        })
    } catch (error) {
      console.error('Error creating tag:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create tag',
        variant: 'destructive'
      })
      
      setSaveStatus('error')
      
      // Reset to idle state after a delay, exactly as in usePlexUser
      await new Promise(resolve => setTimeout(resolve, MIN_LOADING_DELAY))
      setSaveStatus('idle')
    }
  }
  
  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus === 'loading') {
      return // Prevent closing while submitting
    }
    onOpenChange(newOpen)
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
            <DialogTitle className="text-text">Create New Tag</DialogTitle>
            <DialogDescription>
              Enter a name for your new tag. This tag will be created in your {instanceType === 'radarr' ? 'Radarr' : 'Sonarr'} instance.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="tag-name" className="text-text">Tag Name</Label>
            <Input
              id="tag-name"
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