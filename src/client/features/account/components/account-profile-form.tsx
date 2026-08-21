import { Loader2, Save, X } from 'lucide-react'
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
  'flex h-10 w-full min-w-0 flex-1 items-center overflow-hidden rounded-base border-2 border-border bg-secondary-background px-3 py-2 text-sm font-base text-foreground/60'

interface ProfileFieldProps {
  label: string
  editLabel: string
  value: string
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onStartEditing: () => void
  onCommit: (value: string) => void
  error?: string
  disabled: boolean
}

function ProfileField({
  label,
  editLabel,
  value,
  editing,
  onEditingChange,
  onStartEditing,
  onCommit,
  error,
  disabled,
}: ProfileFieldProps) {
  return (
    <div className="space-y-2">
      <Label className="text-foreground">{label}</Label>
      <div className="flex gap-2">
        {editing ? (
          <InlineEdit
            value={value}
            onCommit={onCommit}
            editing={editing}
            onEditingChange={onEditingChange}
            disabled={disabled}
            editLabel={editLabel}
            className="mr-0 min-w-0 flex-1"
            inputClassName="min-w-0"
          />
        ) : (
          <>
            <InlineEditButton
              onClick={onStartEditing}
              editLabel={editLabel}
              className="h-10 w-10 opacity-100"
            />
            <div className={readOnlyFieldClassName}>
              <span className="block w-full truncate">{value}</span>
            </div>
          </>
        )}
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
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
    setEditingEmail,
    setEditingUsername,
    startEditingEmail,
    startEditingUsername,
    commitEmail,
    commitUsername,
    handleCancel,
    onSubmit,
  } = useUpdateProfileForm({ currentEmail, currentUsername })

  const isSubmitting = status === 'loading'

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ProfileField
            label="Email"
            editLabel="Edit email"
            value={form.watch('email')}
            editing={editingEmail}
            onEditingChange={setEditingEmail}
            onStartEditing={startEditingEmail}
            onCommit={commitEmail}
            error={form.formState.errors.email?.message}
            disabled={isSubmitting}
          />
          <ProfileField
            label="Username"
            editLabel="Edit username"
            value={form.watch('username')}
            editing={editingUsername}
            onEditingChange={setEditingUsername}
            onStartEditing={startEditingUsername}
            onCommit={commitUsername}
            error={form.formState.errors.username?.message}
            disabled={isSubmitting}
          />
        </div>

        {hasChanges && (
          <>
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">
                    Current password
                  </FormLabel>
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
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
              {!isSubmitting && (
                <Button
                  type="button"
                  variant="cancel"
                  onClick={handleCancel}
                  className="flex items-center gap-1"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </Button>
              )}
              <Button
                type="submit"
                disabled={status !== 'idle' || !canSubmit}
                className="flex items-center gap-2"
                variant="bluenoShadow"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
              </Button>
            </div>
          </>
        )}
      </form>
    </Form>
  )
}
