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
import { LoginErrorMessage } from '@/features/auth/components/login-error'
import { useChangePasswordForm } from '@/features/account/hooks/useChangePasswordForm'

export function ChangePasswordForm() {
  const { form, status, backendError, onSubmit } = useChangePasswordForm()

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
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
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {backendError && <LoginErrorMessage message={backendError} />}
        <Button
          type="submit"
          disabled={status === 'loading' || status === 'success'}
        >
          {status === 'loading' && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {status === 'success' && <Check className="mr-2 h-4 w-4" />}
          {status === 'loading'
            ? 'Updating...'
            : status === 'success'
              ? 'Updated'
              : 'Update password'}
        </Button>
      </form>
    </Form>
  )
}
