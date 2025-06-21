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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { useMediaQuery } from '@/hooks/use-media-query'
import { QuotaStatusCard } from '@/features/plex/components/user/quota-status-card'
import type { UserWithQuotaInfo } from '@/stores/configStore'
import { z } from 'zod'

// Form schema that handles both create and update scenarios
const QuotaFormSchema = z.object({
  hasQuota: z.boolean(),
  quotaType: z.enum(['daily', 'weekly_rolling', 'monthly']).optional(),
  quotaLimit: z.coerce.number().min(1).max(1000).optional(),
  bypassApproval: z.boolean().default(false),
})

type QuotaFormData = z.infer<typeof QuotaFormSchema>

export interface QuotaEditStatus {
  type: 'idle' | 'loading' | 'success' | 'error'
  message?: string
}

interface FormContentProps {
  form: ReturnType<typeof useForm<QuotaFormData>>
  handleSubmit: (values: QuotaFormData) => Promise<void>
  handleOpenChange: (open: boolean) => void
  saveStatus: QuotaEditStatus
  isFormDirty: boolean
  user: UserWithQuotaInfo
}

const FormContent = React.memo(
  ({
    form,
    handleSubmit,
    handleOpenChange,
    saveStatus,
    isFormDirty,
    user,
  }: FormContentProps) => {
    const hasQuota = form.watch('hasQuota')

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          <div className="space-y-4">
            {/* Current Status Display */}
            <QuotaStatusCard quotaStatus={user?.quotaStatus} />

            {/* Enable/Disable Quota */}
            <FormField
              control={form.control}
              name="hasQuota"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-text">Enable Quota</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={saveStatus.type !== 'idle'}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Quota Configuration - Only show if hasQuota is enabled */}
            {hasQuota && (
              <>
                {/* Quota Type */}
                <FormField
                  control={form.control}
                  name="quotaType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-text">Quota Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={saveStatus.type !== 'idle'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select quota type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly_rolling">
                            Weekly Rolling
                          </SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Quota Limit */}
                <FormField
                  control={form.control}
                  name="quotaLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-text">Quota Limit</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="10"
                          min="1"
                          max="1000"
                          disabled={saveStatus.type !== 'idle'}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Auto-Approve Exceeded Quotas */}
                <FormField
                  control={form.control}
                  name="bypassApproval"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-text">
                          Auto-Approve When Exceeded
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={saveStatus.type !== 'idle'}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="neutral"
              onClick={() => handleOpenChange(false)}
              disabled={saveStatus.type !== 'idle'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={saveStatus.type !== 'idle' || !isFormDirty}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {saveStatus.type === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saveStatus.type === 'success' ? (
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

FormContent.displayName = 'QuotaFormContent'

interface QuotaEditModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  user: UserWithQuotaInfo | null
  onSave: (quotaData: QuotaFormData) => Promise<void>
  saveStatus: QuotaEditStatus
}

/**
 * Displays a modal for editing user quota information and approval settings.
 *
 * Renders a responsive modal form that allows updating quota details such as quota type, limits, reset days, and bypass approval settings. The modal adapts to mobile or desktop layouts and prevents closing while a save operation is in progress.
 *
 * @param isOpen - Whether the modal is open.
 * @param onOpenChange - Callback to handle modal open state changes.
 * @param user - The user with quota info to edit, or `null` for no user.
 * @param onSave - Callback invoked with quota data when the form is submitted.
 * @param saveStatus - Current save operation status.
 *
 * @remark
 * The modal disables closing actions and form inputs while saving. Quota configuration fields are conditionally shown based on whether quotas are enabled.
 */
export function QuotaEditModal({
  isOpen,
  onOpenChange,
  user,
  onSave,
  saveStatus,
}: QuotaEditModalProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const form = useForm<QuotaFormData>({
    resolver: zodResolver(QuotaFormSchema),
    defaultValues: {
      hasQuota: false,
      quotaType: 'monthly',
      quotaLimit: 10,
      bypassApproval: false,
    },
  })

  // Reset form when user changes or modal opens
  useEffect(() => {
    if (user && isOpen) {
      const hasQuota = !!user.quotaStatus
      form.reset({
        hasQuota,
        quotaType: user.quotaStatus?.quotaType || 'monthly',
        quotaLimit: user.quotaStatus?.quotaLimit || 10,
        bypassApproval: user.quotaStatus?.bypassApproval || false,
      })
    }
  }, [user, isOpen, form])

  const handleSubmit = async (values: QuotaFormData) => {
    await onSave(values)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus.type === 'loading') {
      return
    }
    onOpenChange(newOpen)
  }

  const isFormDirty = form.formState.isDirty

  if (!user) return null

  // Conditionally render Dialog or Sheet based on screen size
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          onPointerDownOutside={(e) => {
            if (saveStatus.type === 'loading') {
              e.preventDefault()
            }
          }}
          onEscapeKeyDown={(e) => {
            if (saveStatus.type === 'loading') {
              e.preventDefault()
            }
          }}
          className="overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="text-text">Edit Quota Settings</SheetTitle>
            <SheetDescription>
              Configure usage limits and approval settings for {user.name}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <FormContent
              form={form}
              handleSubmit={handleSubmit}
              handleOpenChange={handleOpenChange}
              saveStatus={saveStatus}
              isFormDirty={isFormDirty}
              user={user}
            />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop view
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (saveStatus.type === 'loading') {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          if (saveStatus.type === 'loading') {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-text">Edit Quota Settings</DialogTitle>
          <DialogDescription>
            Configure usage limits and approval settings for {user.name}
          </DialogDescription>
        </DialogHeader>
        <FormContent
          form={form}
          handleSubmit={handleSubmit}
          handleOpenChange={handleOpenChange}
          saveStatus={saveStatus}
          isFormDirty={isFormDirty}
          user={user}
        />
      </DialogContent>
    </Dialog>
  )
}
