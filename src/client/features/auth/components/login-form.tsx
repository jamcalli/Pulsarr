import { CredentialsSchema } from '@root/schemas/auth/login'
import { revalidateLogic } from '@tanstack/react-form'
import { Loader2 } from 'lucide-react'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { useLogin } from '@/features/auth/hooks/useLogin'
import { useAppForm } from '@/lib/form'

export function LoginForm() {
  const login = useLogin()
  const form = useAppForm({
    defaultValues: { login: '', password: '' },
    validationLogic: revalidateLogic({
      mode: 'submit',
      modeAfterSubmission: 'blur',
    }),
    validators: { onDynamic: CredentialsSchema },
    // The alert shows the error from the mutation, so this catch only ends the submit.
    onSubmit: ({ value }) =>
      login.mutateAsync({ body: value }).catch(() => undefined),
  })

  return (
    <form.AppForm>
      <form.Form>
        <FieldGroup className="gap-4">
          <form.AppField name="login">
            {(field) => (
              <field.TextField
                label="Email or username"
                type="text"
                autoComplete="username"
                required
                placeholder="Username or email address"
                autoFocus
              />
            )}
          </form.AppField>
          <form.AppField name="password">
            {(field) => (
              <field.TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Your password"
              />
            )}
          </form.AppField>
          <ErrorAlert message={login.errorMessage} />
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? (
              <>
                <Loader2 className="animate-spin" data-icon="inline-start" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </FieldGroup>
      </form.Form>
    </form.AppForm>
  )
}
