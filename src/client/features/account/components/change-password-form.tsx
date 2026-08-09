import { Check, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { LoginErrorMessage } from '@/features/auth/components/login-error'
import { useChangePasswordForm } from '@/features/account/hooks/useChangePasswordForm'

export function ChangePasswordForm() {
  const { form, status, backendError, canSubmit, onSubmit } =
    useChangePasswordForm()

  const isSubmitDisabled =
    !canSubmit || status === 'loading' || status === 'success'

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
              <FormDescription className="text-xs text-main-foreground/60">
                Minimum 8 characters
              </FormDescription>
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
            ? 'Updating...'
            : status === 'success'
              ? 'Updated'
              : 'Update Password'}
        </Button>
      </form>
    </Form>
  )
}
