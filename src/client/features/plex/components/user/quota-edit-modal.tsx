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

function QuotaSectionFields({
  contentType,
  form,
  disabled,
}: {
  contentType: 'movie' | 'show'
  form: UseFormReturn<QuotaFormValues>
  disabled: boolean
}) {
  const capitalized = contentType === 'movie' ? 'Movie' : 'Show'
  const colorVar =
    contentType === 'movie' ? 'var(--color-movie)' : 'var(--color-show)'

  type FieldName = keyof QuotaFormValues
  const hasQuotaField = `has${capitalized}Quota` as FieldName
  const quotaTypeField = `${contentType}QuotaType` as FieldName
  const quotaLimitField = `${contentType}QuotaLimit` as FieldName
  const bypassField = `${contentType}BypassApproval` as FieldName
  const hasLifetimeField = `has${capitalized}LifetimeLimit` as FieldName
  const lifetimeLimitField = `${contentType}LifetimeLimit` as FieldName

  const hasQuota = form.watch(hasQuotaField) as boolean
  const hasLifetimeLimit = form.watch(hasLifetimeField) as boolean

  return (
    <div
      className="space-y-4 border-l-2 pl-4"
      style={{ borderColor: colorVar }}
    >
      <h4 className="font-medium text-foreground">{capitalized} Quotas</h4>

      <FormField
        control={form.control}
        name={hasQuotaField}
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel className="text-foreground">
                Enable {capitalized} Quota
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value as boolean}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {hasQuota && (
        <>
          <FormField
            control={form.control}
            name={quotaTypeField}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground">
                  {capitalized} Quota Type
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
            name={quotaLimitField}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground">
                  {capitalized} Quota Limit
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
                    disabled={disabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={bypassField}
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-foreground">
                    Auto-Approve {capitalized}s When Exceeded
                  </FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value as boolean}
                      onCheckedChange={field.onChange}
                      disabled={disabled}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={hasLifetimeField}
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-foreground">
                    Lifetime Limit
                  </FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value as boolean}
                      onCheckedChange={field.onChange}
                      disabled={disabled}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {hasLifetimeLimit && (
            <FormField
              control={form.control}
              name={lifetimeLimitField}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">
                    {capitalized} Lifetime Limit
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={String(field.value ?? '')}
                      type="number"
                      placeholder="100"
                      min={1}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === ''
                            ? undefined
                            : Number(e.target.value),
                        )
                      }
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </>
      )}
    </div>
  )
}

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
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          <div className="space-y-4">
            <QuotaSectionFields
              contentType="movie"
              form={form}
              disabled={saveStatus.type !== 'idle'}
            />
            <QuotaSectionFields
              contentType="show"
              form={form}
              disabled={saveStatus.type !== 'idle'}
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
              disabled={
                saveStatus.type !== 'idle' ||
                !isFormDirty ||
                !form.formState.isValid
              }
              className="min-w-25 flex items-center justify-center gap-2"
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
      hasMovieLifetimeLimit: false,
      movieLifetimeLimit: undefined,
      hasShowQuota: false,
      showQuotaType: 'monthly',
      showQuotaLimit: 10,
      showBypassApproval: false,
      hasShowLifetimeLimit: false,
      showLifetimeLimit: undefined,
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
        hasMovieLifetimeLimit: movieQuota?.lifetimeLimit != null,
        movieLifetimeLimit: movieQuota?.lifetimeLimit || undefined,
        hasShowQuota: !!showQuota,
        showQuotaType: showQuota?.quotaType || 'monthly',
        showQuotaLimit: showQuota?.quotaLimit || 10,
        showBypassApproval: showQuota?.bypassApproval || false,
        hasShowLifetimeLimit: showQuota?.lifetimeLimit != null,
        showLifetimeLimit: showQuota?.lifetimeLimit || undefined,
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
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
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
