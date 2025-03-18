import React, { useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
import { plexUserSchema } from '@/features/plex/store/schemas'
import type { PlexUserSchema } from '@/features/plex/store/schemas'
import { useMediaQuery } from '@/hooks/use-media-query'

interface FormContentProps {
  form: ReturnType<typeof useForm<PlexUserSchema>>
  handleSubmit: (values: PlexUserSchema) => Promise<void>
  handleOpenChange: (open: boolean) => void
  saveStatus: 'idle' | 'loading' | 'success' | 'error'
  isFormDirty: boolean
}

// Extracted and memoized form content component
const FormContent = React.memo(
  ({
    form,
    handleSubmit,
    handleOpenChange,
    saveStatus,
    isFormDirty,
  }: FormContentProps) => {
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
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
                          disabled={saveStatus !== 'idle' || isPlaceholderEmail}
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

            <FormField
              control={form.control}
              name="can_sync"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-text">
                      Can Sync Watchlist
                    </FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
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
    )
  },
)

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
  const isMobile = useMediaQuery('(max-width: 768px)')

  const form = useForm<PlexUserSchema>({
    resolver: zodResolver(plexUserSchema),
    defaultValues: {
      name: '',
      email: '',
      alias: null,
      discord_id: null,
      notify_email: false,
      notify_discord: false,
      can_sync: false,
    },
  })

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        alias: user.alias,
        discord_id: user.discord_id,
        notify_email: user.notify_email,
        notify_discord: user.notify_discord,
        can_sync: user.can_sync,
      })
    }
  }, [user, form])

  const handleSubmit = async (values: PlexUserSchema) => {
    if (!user) return
    await onSave(user.id, values)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus === 'loading') {
      return
    }
    onOpenChange(newOpen)
  }

  const isFormDirty = form.formState.isDirty

  // Conditionally render Dialog or Sheet based on screen size
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
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
          className="overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-text">Edit User Information</SheetTitle>
            <SheetDescription>
              Update user details and notification preferences
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <FormContent
              form={form}
              handleSubmit={handleSubmit}
              handleOpenChange={handleOpenChange}
              saveStatus={saveStatus}
              isFormDirty={isFormDirty}
            />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop view
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
        <FormContent
          form={form}
          handleSubmit={handleSubmit}
          handleOpenChange={handleOpenChange}
          saveStatus={saveStatus}
          isFormDirty={isFormDirty}
        />
      </DialogContent>
    </Dialog>
  )
}
