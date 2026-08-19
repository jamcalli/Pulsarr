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
import { Input } from '@/components/ui/input'
import { ProfileInlineEditField } from '@/features/account/components/profile-inline-edit-field'
import { useUpdateProfileForm } from '@/features/account/hooks/useUpdateProfileForm'
import { LoginErrorMessage } from '@/features/auth/components/login-error'

interface AccountProfileFormProps {
  currentEmail: string
  currentUsername: string
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
          <ProfileInlineEditField
            label="Email"
            value={currentEmail}
            editing={editingEmail}
            editLabel="Click to edit email"
            errorMessage={form.formState.errors.email?.message}
            disabled={isLoading}
            onStartEdit={startEditingEmail}
            onCancelEdit={cancelEditingEmail}
            onCommit={commitEmailDraft}
            onStopEditing={stopEditingEmail}
          />
        </div>

        <div className="space-y-2">
          <ProfileInlineEditField
            label="Username"
            value={currentUsername}
            editing={editingUsername}
            editLabel="Click to edit username"
            errorMessage={form.formState.errors.username?.message}
            disabled={isLoading}
            onStartEdit={startEditingUsername}
            onCancelEdit={cancelEditingUsername}
            onCommit={commitUsernameDraft}
            onStopEditing={stopEditingUsername}
          />
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
