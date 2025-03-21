import { useEffect } from 'react'
import { Loader2, Check, AlertTriangle } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
} from '@/components/ui/form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { useMediaQuery } from '@/hooks/use-media-query'
import { z } from 'zod'
import type { UserWatchlistInfo } from '@/stores/configStore'
import type { Row } from '@tanstack/react-table'
import type { PlexUserUpdates } from '@/features/plex/store/types'

// Define the type for table rows
type PlexUserTableRow = Row<UserWatchlistInfo>

// Define the status type
type BulkUpdateStatus = 'idle' | 'loading' | 'success' | 'error'

// Simplified schema for bulk updates
const bulkUpdateSchema = z.object({
  // Clear fields
  clearAlias: z.boolean().default(false),
  clearDiscordId: z.boolean().default(false),
  clearEmail: z.boolean().default(false),
  // Toggle settings
  setEmailNotify: z.boolean().default(false),
  emailNotifyValue: z.boolean().default(false),
  setDiscordNotify: z.boolean().default(false),
  discordNotifyValue: z.boolean().default(false),
  setCanSync: z.boolean().default(false),
  canSyncValue: z.boolean().default(true),
})

type BulkUpdateSchema = z.infer<typeof bulkUpdateSchema>

interface BulkEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRows: PlexUserTableRow[]
  onSave: (userIds: string[], updates: PlexUserUpdates) => Promise<void>
  saveStatus: BulkUpdateStatus
}

interface FormContentProps {
  form: ReturnType<typeof useForm<BulkUpdateSchema>>
  handleSubmit: (values: BulkUpdateSchema) => Promise<void>
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
          <div className="space-y-4">
            <h3 className="text-text text-sm font-medium">Clear fields</h3>
            {/* Clear Alias */}
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
                    <FormLabel className="text-text">Clear alias</FormLabel>
                    <FormDescription>
                      Remove all aliases from selected users
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            {/* Clear Discord ID */}
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
                    <FormLabel className="text-text">
                      Clear Discord IDs
                    </FormLabel>
                    <FormDescription>
                      Remove all Discord IDs from selected users
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            {/* Clear Email */}
            <FormField
              control={form.control}
              name="clearEmail"
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
                    <FormLabel className="text-text">
                      Reset to placeholder emails
                    </FormLabel>
                    <FormDescription>
                      Reset all email addresses to username@placeholder.com
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
          <div className="space-y-4 pt-2">
            <h3 className="text-text text-sm font-medium">Set permissions</h3>
            {/* Email Notifications */}
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="setEmailNotify"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(value) => {
                          field.onChange(value)
                          // If clearing emails and enabling notifications, show warning
                          if (value && form.getValues('clearEmail')) {
                            form.setValue('emailNotifyValue', false)
                          }
                        }}
                        disabled={saveStatus !== 'idle'}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-text">
                        Set email notifications
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              {form.watch('setEmailNotify') && (
                <FormField
                  control={form.control}
                  name="emailNotifyValue"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 ml-7">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={
                            saveStatus !== 'idle' ||
                            form.getValues('clearEmail')
                          }
                        />
                      </FormControl>
                      <div className="leading-none">
                        <FormLabel className="text-text">
                          Enable email notifications
                          {form.getValues('clearEmail') && (
                            <span className="text-error text-xs ml-2">
                              (Disabled for placeholder emails)
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
                      <FormLabel className="text-text">
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
                        <FormLabel className="text-text">
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
                      <FormLabel className="text-text">
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
                        <FormLabel className="text-text">
                          Allow watchlist syncing
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
                !form.getValues('clearEmail') &&
                !form.getValues('setEmailNotify') &&
                !form.getValues('setDiscordNotify') &&
                !form.getValues('setCanSync'))
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

export default function BulkEditModal({
  open,
  onOpenChange,
  selectedRows,
  onSave,
  saveStatus,
}: BulkEditModalProps) {
  const { toast } = useToast()
  const isMobile = useMediaQuery('(max-width: 768px)')

  const form = useForm<BulkUpdateSchema>({
    resolver: zodResolver(bulkUpdateSchema),
    defaultValues: {
      clearAlias: false,
      clearDiscordId: false,
      clearEmail: false,
      setEmailNotify: false,
      emailNotifyValue: false,
      setDiscordNotify: false,
      discordNotifyValue: false,
      setCanSync: false,
      canSyncValue: true,
    },
  })

  // Watch for changes to clearEmail and adjust emailNotifyValue accordingly
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'clearEmail' && value.clearEmail) {
        // If clearing emails, disable email notifications
        if (value.setEmailNotify) {
          form.setValue('emailNotifyValue', false)
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

  const handleSubmit = async (values: BulkUpdateSchema) => {
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

    if (values.clearEmail) {
      // Use a valid email format that will pass validation
      updates.email = 'placeholder@placeholder.com'
      // When resetting to placeholder emails, always disable email notifications
      if (values.setEmailNotify) {
        updates.notify_email = false
      } else {
        // Add this to explicitly disable notifications for placeholder emails
        updates.notify_email = false
      }
    } else if (values.setEmailNotify) {
      // Only set email notifications if we're not clearing emails
      updates.notify_email = values.emailNotifyValue
    }

    if (values.clearDiscordId) {
      // When clearing Discord IDs, always disable Discord notifications
      if (values.setDiscordNotify) {
        updates.notify_discord = false
      } else {
        // Add this to explicitly disable notifications without Discord ID
        updates.notify_discord = false
      }
    } else if (values.setDiscordNotify) {
      // Only set Discord notifications if we're not clearing Discord IDs
      updates.notify_discord = values.discordNotifyValue
    }

    if (values.setCanSync) {
      updates.can_sync = values.canSyncValue
    }

    try {
      await onSave(userIds, updates)
      // Reset form after successful save
      form.reset()
    } catch (error) {
      console.error('Error in bulk update:', error)
      toast({
        title: 'Error',
        description: 'Failed to apply bulk updates',
        variant: 'destructive',
      })
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
            <SheetTitle className="text-text">Bulk Edit Users</SheetTitle>
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
          <DialogTitle className="text-text">Bulk Edit Users</DialogTitle>
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
