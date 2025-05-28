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
import type { UpdateUser } from '@root/schemas/users/users.schema'
import type { UserStatus } from '@/features/plex/hooks/usePlexUser'

interface FormContentProps {
  form: ReturnType<typeof useForm<PlexUserSchema>>
  handleSubmit: (values: PlexUserSchema) => Promise<void>
  handleOpenChange: (open: boolean) => void
  saveStatus: UserStatus
  isFormDirty: boolean
}

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
              name="apprise"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-text">Apprise</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Apprise endpoint"
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
              name="notify_apprise"
              render={({ field }) => {
                const apprise = form.watch('apprise')
                const hasValidApprise = !!apprise

                // If no apprise endpoint and notifications are on, turn them off
                if (!hasValidApprise && field.value) {
                  field.onChange(false)
                }

                return (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-text">
                        Apprise Notifications
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={saveStatus !== 'idle' || !hasValidApprise}
                        />
                      </FormControl>
                    </div>
                    {!hasValidApprise && (
                      <FormMessage>Requires valid Apprise endpoint</FormMessage>
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
              name="notify_tautulli"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-text">
                      Tautulli Notifications
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
  onSave: (userId: string, updates: UpdateUser) => Promise<void>
  saveStatus: UserStatus
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
      apprise: '',
      alias: null,
      discord_id: null,
      notify_apprise: false,
      notify_discord: false,
      notify_tautulli: false,
      can_sync: false,
    },
  })

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        apprise: user.apprise || '',
        alias: user.alias,
        discord_id: user.discord_id,
        notify_apprise: user.notify_apprise,
        notify_discord: user.notify_discord,
        notify_tautulli: user.notify_tautulli,
        can_sync: user.can_sync,
      })
    }
  }, [user, form])

  const handleSubmit = async (values: PlexUserSchema) => {
    if (!user) return

    // Convert to UpdateUser type for API compatibility
    const updates: UpdateUser = {
      name: values.name,
      apprise: values.apprise,
      alias: values.alias,
      discord_id: values.discord_id,
      notify_apprise: values.notify_apprise,
      notify_discord: values.notify_discord,
      notify_tautulli: values.notify_tautulli,
      can_sync: values.can_sync,
    }

    await onSave(user.id, updates)
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
