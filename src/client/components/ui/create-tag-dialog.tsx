import { useState } from 'react'
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
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { CreateTagBody, CreateTagResponse, Error } from '@root/schemas/radarr/create-tag.schema'

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
  const [isSubmitting, setIsSubmitting] = useState(false)
  
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
    
    setIsSubmitting(true)
    
    try {
      const requestBody: CreateTagBody = {
        instanceId,
        label: tagLabel.trim()
      }
      
      const response = await fetch(`/v1/${instanceType}/create-tag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      const data = await response.json() as CreateTagResponse | Error
      
      if (response.ok) {
        toast({
          description: `Tag "${tagLabel}" created successfully`,
          variant: 'default'
        })
        setTagLabel('')
        onOpenChange(false)
        onSuccess()
      } else {
        // Properly handle the error response
        const errorMessage = 'message' in data ? data.message : 'Failed to create tag'
        throw new Error(errorMessage)
      }
    } catch (error) {
      console.error('Error creating tag:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create tag',
        variant: 'destructive'
      })
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!isSubmitting) {
        onOpenChange(newOpen)
        if (!newOpen) {
          setTagLabel('')
        }
      }
    }}>
      <DialogContent className="sm:max-w-md">
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
              disabled={isSubmitting}
              className="mt-1"
            />
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="neutral"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !tagLabel.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
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