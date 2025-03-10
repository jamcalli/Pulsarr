import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { plexUserSchema, type PlexUserSchema } from '@/features/plex/store/schemas'
import { DEFAULT_EMAIL_PLACEHOLDER } from '@/features/plex/store/constants'
import type { UserListWithCountsResponse } from '@root/schemas/users/users-list.schema';
import { useToast } from '@/hooks/use-toast'

type PlexUserType = UserListWithCountsResponse['users'][0];

interface PlexUserEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: PlexUserType | null
  onUpdate: (userId: number, updates: Partial<PlexUserType>) => Promise<boolean>
  isUpdating: boolean
}

export function PlexUserEditModal({
  open,
  onOpenChange,
  user,
  onUpdate,
  isUpdating: externalIsUpdating,
}: PlexUserEditModalProps) {
  const { toast } = useToast()
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Initialize the form
  const form = useForm<PlexUserSchema>({
    resolver: zodResolver(plexUserSchema),
    defaultValues: {
      name: '',
      email: '',
      alias: null,
      discord_id: null,
      notify_email: false,
      notify_discord: false,
    },
  })

  // Update form data when user prop changes
  React.useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email ?? undefined,
        alias: user.alias,
        discord_id: user.discord_id,
        notify_email: user.notify_email,
        notify_discord: user.notify_discord,
      })
    }
  }, [user, form])

  // Watch for completion and modal close
  React.useEffect(() => {
    if (saveStatus === 'success' && !open) {
      // Reset state after modal is closed
      const timer = setTimeout(() => {
        setSaveStatus('idle')
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [saveStatus, open])

  const handleSubmit = async (values: PlexUserSchema) => {
    if (!user) return

    setSaveStatus('loading')
    try {
      const minimumLoadingTime = new Promise((resolve) =>
        setTimeout(resolve, 500),
      )

      const [success] = await Promise.all([
        onUpdate(user.id, {
          name: values.name,
          email: values.email,
          alias: values.alias,
          discord_id: values.discord_id,
          notify_email: values.notify_email,
          notify_discord: values.notify_discord,
        }),
        minimumLoadingTime,
      ])

      if (success) {
        setSaveStatus('success')
        toast({
          description: 'User information updated successfully',
          variant: 'default',
        })

        // Show success state then close
        await new Promise((resolve) => setTimeout(resolve, 300))
        onOpenChange(false)
      } else {
        throw new Error('Failed to update user')
      }
    } catch (error) {
      console.error('Update error:', error)
      setSaveStatus('error')
      toast({
        description:
          error instanceof Error ? error.message : 'Failed to update user',
        variant: 'destructive',
      })
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSaveStatus('idle')
    }
  }

  // Prevent closing during submission
  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus === 'loading' || externalIsUpdating) {
      return // Prevent closing during loading
    }
    onOpenChange(newOpen)
  }

  // Check if form is dirty (has changes)
  const isFormDirty = form.formState.isDirty
  const isUpdating = saveStatus === 'loading' || externalIsUpdating

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (isUpdating) {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isUpdating) {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-text">Edit User Information</DialogTitle>
          <DialogDescription>
            Update user details and notification preferences
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-8"
          >
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-text">Plex User Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Plex user name"
                        className="bg-muted/50 cursor-not-allowed"
                        disabled={true}
                        readOnly
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-text">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Email address"
                        disabled={isUpdating}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="alias"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-text">Alias</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="User alias (optional)"
                        disabled={isUpdating}
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discord_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-text">Discord ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Discord ID"
                        className="bg-muted/50 cursor-not-allowed"
                        disabled={true}
                        readOnly
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notify_email"
                render={({ field }) => {
                  const email = form.watch('email')
                  const isPlaceholderEmail = email.endsWith(DEFAULT_EMAIL_PLACEHOLDER)
                  // If it's a placeholder email and notifications are on, turn them off
                  if (isPlaceholderEmail && field.value) {
                    field.onChange(false)
                  }

                  return (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-text">
                          Email Notifications
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isUpdating || isPlaceholderEmail}
                          />
                        </FormControl>
                      </div>
                      {isPlaceholderEmail && (
                        <FormMessage>Requires valid email address</FormMessage>
                      )}
                    </FormItem>
                  )
                }}
              />

              <FormField
                control={form.control}
                name="notify_discord"
                render={({ field }) => {
                  const discordId = form.watch('discord_id')
                  const hasDiscordId = Boolean(discordId)
                  // If there's no Discord ID and notifications are on, turn them off
                  if (!hasDiscordId && field.value) {
                    field.onChange(false)
                  }

                  return (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-text">
                          Discord Notifications
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isUpdating || !hasDiscordId}
                          />
                        </FormControl>
                      </div>
                      {!hasDiscordId && (
                        <FormMessage>Requires Discord ID</FormMessage>
                      )}
                    </FormItem>
                  )
                }}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="neutral"
                onClick={() => handleOpenChange(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={isUpdating || !isFormDirty}
                className="min-w-[100px] flex items-center justify-center gap-2"
              >
                {saveStatus === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : saveStatus === 'success' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Saved
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}