import { zodResolver } from '@hookform/resolvers/zod'
import {
  CreateTagResponseSchema as RadarrCreateTagResponseSchema,
  ErrorSchema as RadarrErrorSchema,
} from '@root/schemas/radarr/create-tag.schema'
import { TagLabelSchema } from '@root/schemas/shared/tag-validation.schema'
import {
  CreateTagResponseSchema as SonarrCreateTagResponseSchema,
  ErrorSchema as SonarrErrorSchema,
} from '@root/schemas/sonarr/create-tag.schema'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

// Status type for tracking the dialog state
type SaveStatus = 'idle' | 'loading' | 'success' | 'error'

// Form schema - only handle label field, instanceId is added on submit
const TagFormSchema = z.object({
  label: TagLabelSchema,
})

type TagFormValues = z.infer<typeof TagFormSchema>

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
 * Uses react-hook-form with zod validation to enforce Radarr v6 tag requirements:
 * - Only lowercase letters (a-z), numbers (0-9), and hyphens (-)
 * - Cannot start or end with a hyphen
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
  onSuccess,
}: TagCreationDialogProps) {
  const form = useForm<TagFormValues>({
    resolver: zodResolver(TagFormSchema),
    defaultValues: {
      label: '',
    },
  })

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // Reset form when dialog opens/closes or instanceId changes
  useEffect(() => {
    if (open) {
      form.reset({
        label: '',
      })
      setSaveStatus('idle')
    }
  }, [open, instanceId, form])

  // Handle dialog open state changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && saveStatus !== 'loading') {
      form.reset()
      setSaveStatus('idle')
    }

    if (saveStatus !== 'loading') {
      onOpenChange(newOpen)
    }
  }

  const handleSubmit = async (values: TagFormValues): Promise<void> => {
    setSaveStatus('loading')

    try {
      // Execute with minimum loading time for better UX
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      // Add instanceId to the form values for API submission
      const requestBody = {
        instanceId,
        label: values.label,
      }

      const response = await fetch(api(`/v1/${instanceType}/create-tag`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
      const responseSchema =
        instanceType === 'sonarr'
          ? SonarrCreateTagResponseSchema
          : RadarrCreateTagResponseSchema
      const errorSchema =
        instanceType === 'sonarr' ? SonarrErrorSchema : RadarrErrorSchema

      const data = response.ok
        ? response.status === 204
          ? ({ success: true, data: undefined } as const)
          : responseSchema.safeParse(parsed)
        : errorSchema.safeParse(parsed ?? { message: response.statusText })

      if (response.ok) {
        if (data.success) {
          // Format the instance name for the toast
          const systemType = instanceType === 'radarr' ? 'Radarr' : 'Sonarr'
          const displayName = instanceName
            ? `${systemType} instance "${instanceName}"`
            : systemType

          toast.success(
            `Tag "${values.label}" created successfully in ${displayName}`,
          )

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
          data.success &&
          data.data &&
          'message' in data.data &&
          typeof data.data.message === 'string'
            ? data.data.message
            : response.statusText || 'Failed to create tag'
        throw new Error(message)
      }
    } catch (error) {
      console.error('Error creating tag:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to create tag',
      )

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
        <DialogHeader>
          <DialogTitle className="text-foreground">Create New Tag</DialogTitle>
          <DialogDescription>
            Enter a name for your new tag. This tag will be created in your{' '}
            {instanceType === 'radarr' ? 'Radarr' : 'Sonarr'} instance.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Tag Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., action, comedy, my-tag"
                      disabled={saveStatus !== 'idle'}
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                disabled={saveStatus !== 'idle'}
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
        </Form>
      </DialogContent>
    </Dialog>
  )
}
