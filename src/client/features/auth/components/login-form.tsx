import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { LoginErrorMessage } from '@/features/auth/components/login-error'
import { useLoginForm } from '@/features/auth/hooks/useLoginForm'

export function LoginForm() {
  const { form, status, backendError, emailInputRef, handleSubmit } =
    useLoginForm()

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  ref={(el) => {
                    field.ref(el)
                    emailInputRef.current = el
                  }}
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  placeholder="Password"
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
          className="w-full h-12 font-heading"
          disabled={status !== 'idle'}
          variant="fun"
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="animate-spin mr-2" />
              Logging in...
            </>
          ) : status === 'success' ? (
            <>
              <Check className="animate-check mr-2" />
              Success!
            </>
          ) : (
            'Login'
          )}
        </Button>
      </form>
    </Form>
  )
}
