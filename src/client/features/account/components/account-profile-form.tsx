import { Check, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { InlineEdit, InlineEditButton } from '@/components/ui/inline-edit'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateProfileForm } from '@/features/account/hooks/useUpdateProfileForm'
import { LoginErrorMessage } from '@/features/auth/components/login-error'

interface AccountProfileFormProps {
  currentEmail: string
  currentUsername: string
}

const readOnlyFieldClassName =
  'flex h-10 w-full min-w-0 flex-1 items-center overflow-hidden rounded-base border-2 border-border px-3 py-2 text-sm font-base bg-black/25 text-main-foreground/45 shadow-none'

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
    commitEmailDraft,
    commitUsernameDraft,
    stopEditingEmail,
    stopEditingUsername,
    onSubmit,
  } = useUpdateProfileForm({ currentEmail, currentUsername })

  const isSubmitDisabled =
    !canSubmit || status === 'loading' || status === 'success'
  const isLoading = status === 'loading'

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="space-y-2">
          {editingEmail ? (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <div className="flex gap-2">
                <InlineEdit
                  value={currentEmail}
                  onCommit={commitEmailDraft}
                  editing={editingEmail}
                  onEditingChange={(editing) => {
                    if (!editing) {
                      stopEditingEmail()
                    }
                  }}
                  editLabel="Click to edit email"
                  disabled={isLoading}
                  className="mr-0 min-w-0 flex-1"
                  inputClassName="min-w-0"
                />
                <Button
                  type="button"
                  variant="cancel"
                  onClick={cancelEditingEmail}
                  disabled={isLoading}
                  className="h-10 shrink-0"
                >
                  Cancel
                </Button>
              </div>
              {form.formState.errors.email?.message && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </FormItem>
          ) : (
            <>
              <Label>Email</Label>
              <div className="flex gap-2">
                {!isLoading && (
                  <InlineEditButton
                    onClick={startEditingEmail}
                    editLabel="Click to edit email"
                    className="opacity-100"
                  />
                )}
                <div className={readOnlyFieldClassName}>
                  <span className="block w-full truncate">{currentEmail}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-2">
          {editingUsername ? (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <div className="flex gap-2">
                <InlineEdit
                  value={currentUsername}
                  onCommit={commitUsernameDraft}
                  editing={editingUsername}
                  onEditingChange={(editing) => {
                    if (!editing) {
                      stopEditingUsername()
                    }
                  }}
                  editLabel="Click to edit username"
                  disabled={isLoading}
                  className="mr-0 min-w-0 flex-1"
                  inputClassName="min-w-0"
                />
                <Button
                  type="button"
                  variant="cancel"
                  onClick={cancelEditingUsername}
                  disabled={isLoading}
                  className="h-10 shrink-0"
                >
                  Cancel
                </Button>
              </div>
              {form.formState.errors.username?.message && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.username.message}
                </p>
              )}
            </FormItem>
          ) : (
            <>
              <Label>Username</Label>
              <div className="flex gap-2">
                {!isLoading && (
                  <InlineEditButton
                    onClick={startEditingUsername}
                    editLabel="Click to edit username"
                    className="opacity-100"
                  />
                )}
                <div className={readOnlyFieldClassName}>
                  <span className="block w-full truncate">
                    {currentUsername}
                  </span>
                </div>
              </div>
            </>
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
