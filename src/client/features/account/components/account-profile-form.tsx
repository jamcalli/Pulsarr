import { Check, Loader2 } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import { LoginErrorMessage } from '@/features/auth/components/login-error'
import { useUpdateEmailForm } from '@/features/account/hooks/useUpdateEmailForm'
import { useUpdateUsernameForm } from '@/features/account/hooks/useUpdateUsernameForm'

interface AccountProfileFormProps {
  currentEmail: string
  currentUsername: string
}

export function AccountProfileForm({
  currentEmail,
  currentUsername,
}: AccountProfileFormProps) {
  const emailForm = useUpdateEmailForm(currentEmail)
  const usernameForm = useUpdateUsernameForm(currentUsername)

  return (
    <div className="space-y-6">
      <Form {...emailForm.form}>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={emailForm.form.handleSubmit(emailForm.onSubmit)}
        >
          <FormField
            control={emailForm.form.control}
            name="newEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input {...field} type="email" autoComplete="email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={emailForm.form.control}
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
          {emailForm.backendError && (
            <LoginErrorMessage message={emailForm.backendError} />
          )}
          <Button
            type="submit"
            disabled={
              emailForm.isUnchanged ||
              emailForm.status === 'loading' ||
              emailForm.status === 'success'
            }
          >
            {emailForm.status === 'loading' && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {emailForm.status === 'success' && (
              <Check className="mr-2 h-4 w-4" />
            )}
            {emailForm.status === 'loading'
              ? 'Updating...'
              : emailForm.status === 'success'
                ? 'Updated'
                : 'Update email'}
          </Button>
        </form>
      </Form>

      <Separator />

      <Form {...usernameForm.form}>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={usernameForm.form.handleSubmit(usernameForm.onSubmit)}
        >
          <FormField
            control={usernameForm.form.control}
            name="newUsername"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} type="text" autoComplete="username" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={usernameForm.form.control}
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
          {usernameForm.backendError && (
            <LoginErrorMessage message={usernameForm.backendError} />
          )}
          <Button
            type="submit"
            disabled={
              usernameForm.isUnchanged ||
              usernameForm.status === 'loading' ||
              usernameForm.status === 'success'
            }
          >
            {usernameForm.status === 'loading' && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {usernameForm.status === 'success' && (
              <Check className="mr-2 h-4 w-4" />
            )}
            {usernameForm.status === 'loading'
              ? 'Updating...'
              : usernameForm.status === 'success'
                ? 'Updated'
                : 'Update username'}
          </Button>
        </form>
      </Form>
    </div>
  )
}
