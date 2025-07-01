import React, { useEffect } from 'react'
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
  FormDescription,
} from '@/components/ui/form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { PlexUserTableRow } from '@/features/plex/store/types'
import type { BulkQuotaFormData } from '@/features/plex/hooks/useBulkQuotaManagement'
import { z } from 'zod'

// Form schema for bulk quota configuration
const BulkQuotaFormSchema = z.object({
  // Clear quotas
  clearQuotas: z.boolean().default(false),

  // Movie quota settings
  setMovieQuota: z.boolean().default(false),
  movieQuotaType: z.enum(['daily', 'weekly_rolling', 'monthly']).optional(),
  movieQuotaLimit: z.coerce.number().min(1).max(1000).optional(),
  movieBypassApproval: z.boolean().default(false),

  // Show quota settings
  setShowQuota: z.boolean().default(false),
  showQuotaType: z.enum(['daily', 'weekly_rolling', 'monthly']).optional(),
  showQuotaLimit: z.coerce.number().min(1).max(1000).optional(),
  showBypassApproval: z.boolean().default(false),
})

interface QuotaSectionProps {
  contentType: 'movie' | 'show'
  form: ReturnType<typeof useForm<BulkQuotaFormData>>
  enabled: boolean
  disabled: boolean
  colorStyle: React.CSSProperties
}

const QuotaSection = React.memo(
  ({ contentType, form, enabled, disabled, colorStyle }: QuotaSectionProps) => {
    const capitalizedType =
      contentType.charAt(0).toUpperCase() + contentType.slice(1)
    const fieldPrefix = contentType as 'movie' | 'show'

    return (
      <div className="space-y-4 border-l-2 pl-4" style={colorStyle}>
        <h4 className="font-medium text-foreground">
          {capitalizedType} Quotas
        </h4>

        <FormField
          control={form.control}
          name={`set${capitalizedType}Quota` as keyof BulkQuotaFormData}
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <FormLabel className="text-foreground">
                    Set {fieldPrefix} quotas
                  </FormLabel>
                  <FormDescription>
                    Apply {fieldPrefix} quota configuration to selected users
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value as boolean}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
              </div>
            </FormItem>
          )}
        />

        {enabled && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-4">
            <FormField
              control={form.control}
              name={`${fieldPrefix}QuotaType` as keyof BulkQuotaFormData}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">
                    {capitalizedType} Quota Type
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value as string}
                    disabled={disabled}
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

            <FormField
              control={form.control}
              name={`${fieldPrefix}QuotaLimit` as keyof BulkQuotaFormData}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">
                    {capitalizedType} Quota Limit
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="10"
                      min="1"
                      max="1000"
                      disabled={disabled}
                      value={field.value as number | undefined}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`${fieldPrefix}BypassApproval` as keyof BulkQuotaFormData}
              render={({ field }) => (
                <FormItem className="flex flex-col justify-end h-full">
                  <div className="flex items-center space-x-2">
                    <FormControl>
                      <Switch
                        checked={field.value as boolean}
                        onCheckedChange={field.onChange}
                        disabled={disabled}
                      />
                    </FormControl>
                    <div className="flex items-center">
                      <FormLabel className="text-foreground m-0">
                        Auto-approve when exceeded
                      </FormLabel>
                    </div>
                  </div>
                  <div className="mb-2" />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>
    )
  },
)

QuotaSection.displayName = 'QuotaSection'

export interface BulkQuotaEditStatus {
  type: 'idle' | 'loading' | 'success' | 'error'
  message?: string
}

interface FormContentProps {
  form: ReturnType<typeof useForm<BulkQuotaFormData>>
  handleSubmit: (values: BulkQuotaFormData) => Promise<void>
  handleOpenChange: (open: boolean) => void
  saveStatus: BulkQuotaEditStatus
  isFormDirty: boolean
  selectedCount: number
}

const FormContent = React.memo(
  ({
    form,
    handleSubmit,
    handleOpenChange,
    saveStatus,
    isFormDirty,
    selectedCount,
  }: FormContentProps) => {
    const setMovieQuota = form.watch('setMovieQuota')
    const setShowQuota = form.watch('setShowQuota')
    const clearQuotas = form.watch('clearQuotas')

    const isSubmitDisabled = React.useMemo(() => {
      if (saveStatus.type !== 'idle' || !isFormDirty) return true

      const hasAction = clearQuotas || setMovieQuota || setShowQuota
      if (!hasAction) return true

      if (
        setMovieQuota &&
        (!form.getValues('movieQuotaType') ||
          !form.getValues('movieQuotaLimit'))
      ) {
        return true
      }

      if (
        setShowQuota &&
        (!form.getValues('showQuotaType') || !form.getValues('showQuotaLimit'))
      ) {
        return true
      }

      return false
    }, [
      saveStatus.type,
      isFormDirty,
      clearQuotas,
      setMovieQuota,
      setShowQuota,
      form,
    ])

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="space-y-4">
            {/* Warning Alert */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Bulk Quota Operation</AlertTitle>
              <AlertDescription>
                This will apply quota changes to {selectedCount} selected user
                {selectedCount !== 1 ? 's' : ''}. This action cannot be undone.
              </AlertDescription>
            </Alert>

            {/* Clear Quotas Section */}
            <div className="space-y-4 border-l-2 border-red-500 pl-4">
              <h4 className="font-medium text-foreground">Clear Quotas</h4>

              <FormField
                control={form.control}
                name="clearQuotas"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="text-foreground">
                          Remove all quotas
                        </FormLabel>
                        <FormDescription>
                          Delete all existing quota configurations from selected
                          users
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(value) => {
                            field.onChange(value)
                            // If clearing quotas, disable setting new ones
                            if (value) {
                              form.setValue('setMovieQuota', false)
                              form.setValue('setShowQuota', false)
                            }
                          }}
                          disabled={saveStatus.type !== 'idle'}
                        />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <QuotaSection
              contentType="movie"
              form={form}
              enabled={setMovieQuota && !clearQuotas}
              disabled={saveStatus.type !== 'idle' || clearQuotas}
              colorStyle={{ borderColor: 'var(--color-movie)' }}
            />
            <QuotaSection
              contentType="show"
              form={form}
              enabled={setShowQuota && !clearQuotas}
              disabled={saveStatus.type !== 'idle' || clearQuotas}
              colorStyle={{ borderColor: 'var(--color-show)' }}
            />
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
              disabled={isSubmitDisabled}
              className="min-w-[100px] flex items-center justify-center gap-2"
            >
              {saveStatus.type === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : saveStatus.type === 'success' ? (
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
  },
)

FormContent.displayName = 'BulkQuotaFormContent'

interface BulkQuotaEditModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  selectedRows: PlexUserTableRow[]
  onSave: (formData: BulkQuotaFormData) => Promise<void>
  saveStatus: BulkQuotaEditStatus
}

/**
 * Renders a responsive modal for bulk editing quota settings across multiple users.
 *
 * Allows administrators to clear all quotas or apply new movie and show quota configurations to selected users. The modal adapts its layout for mobile and desktop screens, disables interaction during save operations, and resets form state when opened.
 *
 * @param isOpen - Whether the modal is open
 * @param onOpenChange - Callback to update the modal's open state
 * @param selectedRows - The user rows selected for bulk editing
 * @param onSave - Callback invoked with the quota form data on submission
 * @param saveStatus - The current status of the save operation
 * @returns The modal component for bulk quota editing
 */
export function BulkQuotaEditModal({
  isOpen,
  onOpenChange,
  selectedRows,
  onSave,
  saveStatus,
}: BulkQuotaEditModalProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const form = useForm<BulkQuotaFormData>({
    resolver: zodResolver(BulkQuotaFormSchema),
    defaultValues: {
      clearQuotas: false,
      setMovieQuota: false,
      movieQuotaType: 'monthly',
      movieQuotaLimit: 10,
      movieBypassApproval: false,
      setShowQuota: false,
      showQuotaType: 'monthly',
      showQuotaLimit: 10,
      showBypassApproval: false,
    },
  })

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      form.reset()
    }
  }, [isOpen, form])

  const handleSubmit = async (values: BulkQuotaFormData) => {
    await onSave(values)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (saveStatus.type === 'loading') {
      return
    }
    onOpenChange(newOpen)
  }

  const modalEventHandlers = React.useMemo(
    () => ({
      onPointerDownOutside: (e: Event) => {
        if (saveStatus.type === 'loading') {
          e.preventDefault()
        }
      },
      onEscapeKeyDown: (e: KeyboardEvent) => {
        if (saveStatus.type === 'loading') {
          e.preventDefault()
        }
      },
    }),
    [saveStatus.type],
  )

  const isFormDirty = form.formState.isDirty
  const selectedCount = selectedRows.length

  // Conditionally render Dialog or Sheet based on screen size
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent {...modalEventHandlers} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-foreground">
              Bulk Edit Quotas
            </SheetTitle>
            <SheetDescription>
              Configure quota settings for {selectedCount} selected user
              {selectedCount !== 1 ? 's' : ''}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <FormContent
              form={form}
              handleSubmit={handleSubmit}
              handleOpenChange={handleOpenChange}
              saveStatus={saveStatus}
              isFormDirty={isFormDirty}
              selectedCount={selectedCount}
            />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop view
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl" {...modalEventHandlers}>
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Bulk Edit Quotas
          </DialogTitle>
          <DialogDescription>
            Configure quota settings for {selectedCount} selected user
            {selectedCount !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>
        <FormContent
          form={form}
          handleSubmit={handleSubmit}
          handleOpenChange={handleOpenChange}
          saveStatus={saveStatus}
          isFormDirty={isFormDirty}
          selectedCount={selectedCount}
        />
      </DialogContent>
    </Dialog>
  )
}
