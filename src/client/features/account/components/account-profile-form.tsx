import { Check, Loader2, Pencil, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { LoginErrorMessage } from '@/features/auth/components/login-error'
import { useUpdateProfileForm } from '@/features/account/hooks/useUpdateProfileForm'

interface AccountProfileFormProps {
  currentEmail: string
  currentUsername: string
}

const readOnlyFieldClassName =
  'flex h-10 w-full min-w-0 flex-1 items-center overflow-hidden rounded-base border-2 border-border px-3 py-2 text-sm font-base bg-black/25 text-main-foreground/45 shadow-none'

interface ReadOnlyProfileFieldProps {
  value: string
  onEdit: () => void
  editTooltip: string
  disabled?: boolean
}

function ReadOnlyProfileField({
  value,
  onEdit,
  editTooltip,
  disabled = false,
}: ReadOnlyProfileFieldProps) {
  return (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="noShadow"
            size="icon"
            onClick={onEdit}
            disabled={disabled}
            className="shrink-0"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{editTooltip}</TooltipContent>
      </Tooltip>
      <div className={readOnlyFieldClassName}>
        <span className="block w-full truncate">{value}</span>
      </div>
    </div>
  )
}

export function AccountProfileForm({
  currentEmail,
  currentUsername,
}: AccountProfileFormProps) {
  const {
    form,
    status,
    backendError,
    hasChanges,
    canSubmit,
    editingEmail,
    editingUsername,
    startEditingEmail,
    startEditingUsername,
    cancelEditingEmail,
    cancelEditingUsername,
    onSubmit,
  } = useUpdateProfileForm({ currentEmail, currentUsername })

  const isSubmitDisabled =
    !canSubmit || status === 'loading' || status === 'success'

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="space-y-2">
          <FormLabel>Email</FormLabel>
          {editingEmail ? (
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        autoComplete="email"
                        className="min-w-0 flex-1"
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="cancel"
                      onClick={cancelEditingEmail}
                      disabled={status === 'loading'}
                      className="h-10 shrink-0"
                    >
                      Cancel
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <ReadOnlyProfileField
              value={currentEmail}
              onEdit={startEditingEmail}
              editTooltip="Click to edit email"
              disabled={status === 'loading'}
            />
          )}
        </div>

        <div className="space-y-2">
          <FormLabel>Username</FormLabel>
          {editingUsername ? (
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        autoComplete="username"
                        className="min-w-0 flex-1"
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="cancel"
                      onClick={cancelEditingUsername}
                      disabled={status === 'loading'}
                      className="h-10 shrink-0"
                    >
                      Cancel
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <ReadOnlyProfileField
              value={currentUsername}
              onEdit={startEditingUsername}
              editTooltip="Click to edit username"
              disabled={status === 'loading'}
            />
          )}
        </div>

        {hasChanges && (
          <>
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      autoComplete="current-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {backendError && <LoginErrorMessage message={backendError} />}
            <Button
              type="submit"
              variant={canSubmit ? 'blue' : 'neutralnoShadow'}
              disabled={isSubmitDisabled}
            >
              {status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : status === 'success' ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {status === 'loading'
                ? 'Saving...'
                : status === 'success'
                  ? 'Saved'
                  : 'Save Profile'}
            </Button>
          </>
        )}
      </form>
    </Form>
  )
}
