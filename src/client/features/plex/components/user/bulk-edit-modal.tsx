import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { bulkUpdateSchema } from '@/features/plex/store/schemas'
import type {
  BulkUpdateStatus,
  PlexUserTableRow,
  PlexUserUpdates,
} from '@/features/plex/store/types'
import { useMediaQuery } from '@/hooks/use-media-query'

interface BulkEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRows: PlexUserTableRow[]
  onSave: (userIds: number[], updates: PlexUserUpdates) => Promise<void>
  saveStatus: BulkUpdateStatus
}

interface FormContentProps {
  form: ReturnType<typeof useForm<z.input<typeof bulkUpdateSchema>>>
  handleSubmit: (values: z.input<typeof bulkUpdateSchema>) => Promise<void>
  handleOpenChange: (open: boolean) => void
  saveStatus: BulkUpdateStatus
  selectedRows: PlexUserTableRow[]
}

const FormContent = ({
  form,
  handleSubmit,
  handleOpenChange,
  saveStatus,
  selectedRows,
}: FormContentProps) => {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="space-y-4">
          <Alert variant="error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              You are about to edit {selectedRows.length} users. This action
              cannot be undone.
            </AlertDescription>
          </Alert>

          {/* Clear fields section */}
          <div className="space-y-4 pt-4">
            <h3 className="text-lg font-medium text-foreground">
              Clear fields
            </h3>

            {/* Clear Alias */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="clearAlias"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-foreground">
                        Clear alias
                      </FormLabel>
                      <FormDescription>
                        Remove all aliases from selected users
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* Clear Discord ID */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="clearDiscordId"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-foreground">
                        Clear Discord IDs
                      </FormLabel>
                      <FormDescription>
                        Remove all Discord IDs from selected users
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* Clear Apprise */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="clearApprise"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-foreground">
                        Clear Apprise endpoints
                      </FormLabel>
                      <FormDescription>
                        Remove all Apprise endpoints
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Set permissions section */}
          <div className="space-y-4 pt-4">
            <h3 className="text-lg font-medium text-foreground">
              Set permissions
            </h3>

            {/* Apprise Notifications */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="setAppriseNotify"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(value) => {
                          field.onChange(value)
                          // If clearing apprise and enabling notifications, show warning
                          if (value && form.getValues('clearApprise')) {
                            form.setValue('appriseNotifyValue', false)
                          }
                        }}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-foreground">
                        Set Apprise notifications
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              {form.watch('setAppriseNotify') && (
                <FormField
                  control={form.control}
                  name="appriseNotifyValue"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 ml-7">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={
                            saveStatus !== 'idle' ||
                            form.getValues('clearApprise')
                          }
                        />
                      </FormControl>
                      <div className="leading-none">
                        <FormLabel className="text-foreground">
                          Enable Apprise notifications
                          {form.getValues('clearApprise') && (
                            <span className="text-error text-xs ml-2">
                              (Disabled without Apprise endpoint)
                            </span>
                          )}
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Discord Notifications */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="setDiscordNotify"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(value) => {
                          field.onChange(value)
                          // If clearing Discord IDs and enabling notifications, show warning
                          if (value && form.getValues('clearDiscordId')) {
                            form.setValue('discordNotifyValue', false)
                          }
                        }}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-foreground">
                        Set Discord notifications
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              {form.watch('setDiscordNotify') && (
                <FormField
                  control={form.control}
                  name="discordNotifyValue"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 ml-7">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={
                            saveStatus !== 'idle' ||
                            form.getValues('clearDiscordId')
                          }
                        />
                      </FormControl>
                      <div className="leading-none">
                        <FormLabel className="text-foreground">
                          Enable Discord notifications
                          {form.getValues('clearDiscordId') && (
                            <span className="text-error text-xs ml-2">
                              (Disabled without Discord ID)
                            </span>
                          )}
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Tautulli Notifications */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="setTautulliNotify"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-foreground">
                        Set Tautulli notifications
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              {form.watch('setTautulliNotify') && (
                <FormField
                  control={form.control}
                  name="tautulliNotifyValue"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 ml-7">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={saveStatus !== 'idle'}
                        />
                      </FormControl>
                      <div className="leading-none">
                        <FormLabel className="text-foreground">
                          Enable Tautulli notifications
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Can Sync */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="setCanSync"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-foreground">
                        Set watchlist sync permission
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              {form.watch('setCanSync') && (
                <FormField
                  control={form.control}
                  name="canSyncValue"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 ml-7">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={saveStatus !== 'idle'}
                        />
                      </FormControl>
                      <div className="leading-none">
                        <FormLabel className="text-foreground">
                          Allow watchlist syncing
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Requires Approval */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="setRequiresApproval"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-foreground">
                        Set approval requirement
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              {form.watch('setRequiresApproval') && (
                <FormField
                  control={form.control}
                  name="requiresApprovalValue"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 ml-7">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={saveStatus !== 'idle'}
                        />
                      </FormControl>
                      <div className="leading-none">
                        <FormLabel className="text-foreground">
                          Require approval for all content
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>
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
            disabled={
              saveStatus !== 'idle' ||
              (!form.getValues('clearAlias') &&
                !form.getValues('clearDiscordId') &&
                !form.getValues('clearApprise') &&
                !form.getValues('setAppriseNotify') &&
                !form.getValues('setDiscordNotify') &&
                !form.getValues('setTautulliNotify') &&
                !form.getValues('setCanSync') &&
                !form.getValues('setRequiresApproval'))
            }
            className="min-w-[100px] flex items-center justify-center gap-2"
          >
            {saveStatus === 'loading' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : saveStatus === 'success' ? (
              <>
                <Check className="h-4 w-4" />
                Updated
              </>
            ) : (
              'Apply Changes'
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}

/**
 * Displays a responsive modal for bulk editing multiple Plex users, allowing administrators to clear user fields and modify notification, sync, and approval permissions.
 *
 * Presents a form for updating selected users, supporting the clearing of alias, Discord ID, and Apprise endpoints, as well as toggling Apprise, Discord, and Tautulli notifications, watchlist sync, and approval requirement settings. Disables controls and prevents modal closure during save operations, and provides feedback on update success or failure.
 */
export default function BulkEditModal({
  open,
  onOpenChange,
  selectedRows,
  onSave,
  saveStatus,
}: BulkEditModalProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const form = useForm<z.input<typeof bulkUpdateSchema>>({
    resolver: zodResolver(bulkUpdateSchema),
    defaultValues: {
      clearAlias: false,
      clearDiscordId: false,
      clearApprise: false,
      setAppriseNotify: false,
      appriseNotifyValue: false,
      setDiscordNotify: false,
      discordNotifyValue: false,
      setTautulliNotify: false,
      tautulliNotifyValue: false,
      setCanSync: false,
      canSyncValue: true,
      setRequiresApproval: false,
      requiresApprovalValue: false,
    },
  })

  // Watch for changes to clearApprise and adjust appriseNotifyValue accordingly
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'clearApprise' && value.clearApprise) {
        // If clearing apprise endpoints, disable apprise notifications
        if (value.setAppriseNotify) {
          form.setValue('appriseNotifyValue', false)
        }
      }
      if (name === 'clearDiscordId' && value.clearDiscordId) {
        // If clearing Discord IDs, disable Discord notifications
        if (value.setDiscordNotify) {
          form.setValue('discordNotifyValue', false)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [form])

  const handleSubmit = async (values: z.input<typeof bulkUpdateSchema>) => {
    if (!selectedRows.length) return

    // Extract userIds from selected rows
    const userIds = selectedRows.map((row) => row.original.id)

    // Transform the form values to API-compatible updates
    const updates: PlexUserUpdates = {}

    if (values.clearAlias) {
      updates.alias = null
    }

    if (values.clearDiscordId) {
      updates.discord_id = null
    }

    if (values.clearApprise) {
      // Set to null to clear the apprise field and always disable notifications
      updates.apprise = null
      updates.notify_apprise = false
    } else if (values.setAppriseNotify) {
      // Only set notifications if we're not clearing endpoints
      updates.notify_apprise = values.appriseNotifyValue
    }

    if (values.clearDiscordId) {
      // When clearing Discord IDs, always disable Discord notifications
      updates.notify_discord = false
    } else if (values.setDiscordNotify) {
      // Only set Discord notifications if we're not clearing Discord IDs
      updates.notify_discord = values.discordNotifyValue
    }

    if (values.setTautulliNotify) {
      updates.notify_tautulli = values.tautulliNotifyValue
    }

    if (values.setCanSync) {
      updates.can_sync = values.canSyncValue
    }

    if (values.setRequiresApproval) {
      updates.requires_approval = values.requiresApprovalValue
    }

    try {
      await onSave(userIds, updates)
      // Reset form after successful save
      form.reset()
    } catch (error) {
      console.error('Error in bulk update:', error)
      toast.error('Failed to apply bulk updates')
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus === 'loading') {
      return
    }
    if (!newOpen) {
      // Reset form when closing
      form.reset()
    }
    onOpenChange(newOpen)
  }

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
            <SheetTitle className="text-foreground">Bulk Edit Users</SheetTitle>
            <SheetDescription>
              Apply changes to {selectedRows.length} selected users
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <FormContent
              form={form}
              handleSubmit={handleSubmit}
              handleOpenChange={handleOpenChange}
              saveStatus={saveStatus}
              selectedRows={selectedRows}
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
          <DialogTitle className="text-foreground">Bulk Edit Users</DialogTitle>
          <DialogDescription>
            Apply changes to {selectedRows.length} selected users
          </DialogDescription>
        </DialogHeader>
        <FormContent
          form={form}
          handleSubmit={handleSubmit}
          handleOpenChange={handleOpenChange}
          saveStatus={saveStatus}
          selectedRows={selectedRows}
        />
      </DialogContent>
    </Dialog>
  )
}
