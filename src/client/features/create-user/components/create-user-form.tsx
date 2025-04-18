import { Button } from '@/components/ui/button'
import { Loader2, Check } from 'lucide-react'
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { CreateUserErrorMessage } from '@/features/create-user/components/create-user-error'
import { useCreateUserForm } from '@/features/create-user/hooks/useCreateUserForm'
import { useRef, useEffect } from 'react'

export function CreateUserForm() {
  const { form, status, backendError, handleSubmit } = useCreateUserForm()
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  ref={emailInputRef}
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
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
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
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  placeholder="Confirm Password"
                  autoComplete="new-password"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {backendError && <CreateUserErrorMessage message={backendError} />}
        <Button
          type="submit"
          className="w-full h-12 font-heading"
          disabled={!form.formState.isValid || status !== 'idle'}
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="animate-spin mr-2" />
              Creating...
            </>
          ) : status === 'success' ? (
            <>
              <Check className="animate-check mr-2" />
              Created!
            </>
          ) : (
            'Create User'
          )}
        </Button>
      </form>
    </Form>
  )
}
