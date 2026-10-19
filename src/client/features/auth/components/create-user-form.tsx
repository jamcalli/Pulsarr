import { CreateAdminFormSchema } from '@root/schemas/auth/admin-user'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { useCreateAdmin } from '@/features/auth/hooks/useCreateAdmin'
import { liveValidation, useAppForm } from '@/lib/form'

export function CreateUserForm() {
  const createAdmin = useCreateAdmin()
  const form = useAppForm({
    defaultValues: {
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
    validationLogic: liveValidation,
    validators: { onDynamic: CreateAdminFormSchema },
    // The alert shows the error from the mutation, so this catch only ends the submit.
    onSubmit: ({ value: { email, username, password } }) =>
      createAdmin
        .mutateAsync({ body: { email, username, password } })
        .catch(() => undefined),
  })

  return (
    <form.AppForm>
      <form.Form>
        <FieldGroup className="gap-4">
          <form.AppField name="email">
            {(field) => (
              <field.TextField
                label="Email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                autoFocus
              />
            )}
          </form.AppField>
          <form.AppField name="username">
            {(field) => (
              <field.TextField
                label="Username"
                type="text"
                autoComplete="username"
                required
                placeholder="Pick a username"
              />
            )}
          </form.AppField>
          <form.AppField name="password">
            {(field) => (
              <field.TextField
                label="Password"
                type="password"
                autoComplete="new-password"
                required
                placeholder="At least 8 characters"
              />
            )}
          </form.AppField>
          <form.AppField name="confirmPassword">
            {(field) => (
              <field.TextField
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                required
                placeholder="Type it again"
              />
            )}
          </form.AppField>
          <ErrorAlert message={createAdmin.errorMessage} />
          <Button
            type="submit"
            className="w-full"
            disabled={createAdmin.isPending}
          >
            <BusyLabel
              busy={createAdmin.isPending}
              label="Create account"
              busyLabel="Creating..."
            />
          </Button>
        </FieldGroup>
      </form.Form>
    </form.AppForm>
  )
}
