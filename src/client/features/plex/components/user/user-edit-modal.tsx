import React, { useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
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
import type { UserWatchlistInfo } from '@/stores/configStore'

// Define the form schema
const userFormSchema = z
  .object({
    name: z.string(),
    email: z.string().email('Invalid email address'),
    alias: z.string().nullable(),
    discord_id: z.string().nullable(),
    notify_email: z.boolean(),
    notify_discord: z.boolean(),
  })
  .refine(
    (data) => {
      // Cannot have discord notifications without discord ID
      if (data.notify_discord && !data.discord_id) {
        return false
      }
      // Cannot have email notifications with placeholder email
      if (data.notify_email && data.email.endsWith('@placeholder.com')) {
        return false
      }
      return true
    },
    {
      message: 'Invalid notification settings based on user information',
      path: ['notify_settings'], // Custom path for the error
    },
  )

type UserFormValues = z.infer<typeof userFormSchema>

interface UserEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserWatchlistInfo | null
  onSave: (userId: string, updates: Partial<UserWatchlistInfo>) => Promise<void>
  saveStatus: 'idle' | 'loading' | 'success' | 'error'
}

export default function UserEditModal({
  open,
  onOpenChange,
  user,
  onSave,
  saveStatus,
}: UserEditModalProps) {
  // Initialize the form
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
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
  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        alias: user.alias,
        discord_id: user.discord_id,
        notify_email: user.notify_email,
        notify_discord: user.notify_discord,
      })
    }
  }, [user, form])

  const handleSubmit = async (values: UserFormValues) => {
    if (!user) return
    await onSave(user.id, values)
  }

  // Prevent closing during submission
  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus === 'loading') {
      return // Prevent closing during loading
    }
    onOpenChange(newOpen)
  }

  // Check if form is dirty (has changes)
  const isFormDirty = form.formState.isDirty

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
                        disabled={saveStatus !== 'idle'}
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
                        disabled={saveStatus !== 'idle'}
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
                  const isPlaceholderEmail = email.endsWith('@placeholder.com')
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
                            disabled={
                              saveStatus !== 'idle' || isPlaceholderEmail
                            }
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
                            disabled={saveStatus !== 'idle' || !hasDiscordId}
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
                disabled={saveStatus !== 'idle'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={saveStatus !== 'idle' || !isFormDirty}
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