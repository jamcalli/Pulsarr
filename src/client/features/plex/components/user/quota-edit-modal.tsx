import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Loader2 } from 'lucide-react'
import React, { useEffect } from 'react'
import { type UseFormReturn, useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  type QuotaEditStatus,
  type QuotaFormData,
  QuotaFormSchema,
  type QuotaFormValues,
} from '@/features/plex/quota/form-schema'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { UserWithQuotaInfo } from '@/stores/configStore'

interface FormContentProps {
  form: UseFormReturn<QuotaFormValues>
  handleSubmit: (values: QuotaFormValues) => Promise<void>
  handleOpenChange: (open: boolean) => void
  saveStatus: QuotaEditStatus
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
    const hasMovieQuota = form.watch('hasMovieQuota')
    const hasShowQuota = form.watch('hasShowQuota')

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          <div className="space-y-4">
            {/* Movie Quota Section */}
            <div
              className="space-y-4 border-l-2 pl-4"
              style={{ borderColor: 'var(--color-movie)' }}
            >
              <h4 className="font-medium text-foreground">Movie Quotas</h4>

              {/* Enable/Disable Movie Quota */}
              <FormField
                control={form.control}
                name="hasMovieQuota"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-foreground">
                        Enable Movie Quota
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

              {/* Movie Quota Configuration */}
              {hasMovieQuota && (
                <>
                  <FormField
                    control={form.control}
                    name="movieQuotaType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">
                          Movie Quota Type
                        </FormLabel>
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

                  <FormField
                    control={form.control}
                    name="movieQuotaLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">
                          Movie Quota Limit
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={String(field.value ?? '')}
                            type="number"
                            placeholder="10"
                            min={1}
                            max="1000"
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ''
                                  ? undefined
                                  : Number(e.target.value),
                              )
                            }
                            disabled={saveStatus.type !== 'idle'}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="movieBypassApproval"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-foreground">
                            Auto-Approve Movies When Exceeded
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

            {/* Show Quota Section */}
            <div
              className="space-y-4 border-l-2 pl-4"
              style={{ borderColor: 'var(--color-show)' }}
            >
              <h4 className="font-medium text-foreground">Show Quotas</h4>

              {/* Enable/Disable Show Quota */}
              <FormField
                control={form.control}
                name="hasShowQuota"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-foreground">
                        Enable Show Quota
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

              {/* Show Quota Configuration */}
              {hasShowQuota && (
                <>
                  <FormField
                    control={form.control}
                    name="showQuotaType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">
                          Show Quota Type
                        </FormLabel>
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

                  <FormField
                    control={form.control}
                    name="showQuotaLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">
                          Show Quota Limit
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={String(field.value ?? '')}
                            type="number"
                            placeholder="10"
                            min={1}
                            max="1000"
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ''
                                  ? undefined
                                  : Number(e.target.value),
                              )
                            }
                            disabled={saveStatus.type !== 'idle'}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="showBypassApproval"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-foreground">
                            Auto-Approve Shows When Exceeded
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
              disabled={
                saveStatus.type !== 'idle' ||
                !isFormDirty ||
                !form.formState.isValid
              }
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
 * Displays a responsive modal for editing a user's movie and show quota settings.
 *
 * Enables configuration of quota limits, types, and approval bypass options for movies and shows. The modal adapts its layout for mobile and desktop, and disables interaction or closing while a save operation is in progress.
 *
 * @param isOpen - Whether the modal is currently open
 * @param onOpenChange - Callback to update the modal's open state
 * @param user - The user whose quota settings are being edited, or `null` if no user is selected
 * @param onSave - Callback invoked with the updated quota data when the form is submitted
 * @param saveStatus - The current status of the save operation
 * @returns The modal component, or `null` if no user is provided
 */
export function QuotaEditModal({
  isOpen,
  onOpenChange,
  user,
  onSave,
  saveStatus,
}: QuotaEditModalProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const form = useForm<QuotaFormValues>({
    resolver: zodResolver(QuotaFormSchema),
    mode: 'onChange',
    defaultValues: {
      hasMovieQuota: false,
      movieQuotaType: 'monthly',
      movieQuotaLimit: 10,
      movieBypassApproval: false,
      hasShowQuota: false,
      showQuotaType: 'monthly',
      showQuotaLimit: 10,
      showBypassApproval: false,
    },
  })

  // Reset form when user changes or modal opens
  useEffect(() => {
    if (user && isOpen) {
      const movieQuota = user.userQuotas?.movieQuota
      const showQuota = user.userQuotas?.showQuota

      form.reset({
        hasMovieQuota: !!movieQuota,
        movieQuotaType: movieQuota?.quotaType || 'monthly',
        movieQuotaLimit: movieQuota?.quotaLimit || 10,
        movieBypassApproval: movieQuota?.bypassApproval || false,
        hasShowQuota: !!showQuota,
        showQuotaType: showQuota?.quotaType || 'monthly',
        showQuotaLimit: showQuota?.quotaLimit || 10,
        showBypassApproval: showQuota?.bypassApproval || false,
      })
    }
  }, [user, isOpen, form])

  const handleSubmit = async (values: QuotaFormValues) => {
    // Transform the form data to the expected schema output type
    const transformedData = QuotaFormSchema.parse(values)
    await onSave(transformedData)
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
            <SheetTitle className="text-foreground">
              Edit Quota Settings
            </SheetTitle>
            <SheetDescription>
              Configure separate usage limits for movies and shows for{' '}
              {user.name}
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
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
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
          <DialogTitle className="text-foreground">
            Edit Quota Settings
          </DialogTitle>
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
        />
      </DialogContent>
    </Dialog>
  )
}
