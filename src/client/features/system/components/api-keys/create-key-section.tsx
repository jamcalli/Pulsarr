import { CreateApiKeySchema } from '@root/schemas/api-keys/api-keys.schema'
import { BusyLabel } from '@/components/busy-label'
import { ErrorAlert } from '@/components/error-alert'
import {
  FieldRowSkeleton,
  SettingsSectionSkeleton,
} from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { Button } from '@/components/ui/button'
import { useCreateApiKey } from '@/features/system/hooks/api-keys/useApiKeys'
import { liveValidation, useAppForm } from '@/lib/form'

const TITLE = 'Create a key'
const DESCRIPTION =
  'Name it after what will use it, so you can tell keys apart later.'

export function CreateKeySection() {
  const create = useCreateApiKey()
  const form = useAppForm({
    defaultValues: { name: '' },
    validationLogic: liveValidation,
    validators: { onDynamic: CreateApiKeySchema },
    // The alert shows the error from the mutation, so this catch only ends the submit.
    onSubmit: ({ value, formApi }) =>
      create
        .create(value.name)
        .then(() => formApi.reset())
        .catch(() => undefined),
  })

  return (
    <form.AppForm>
      <form.Form>
        <SettingsSection title={TITLE} description={DESCRIPTION}>
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label="Name"
                type="text"
                autoComplete="off"
                placeholder="Home Assistant"
                action={
                  <Button type="submit" disabled={create.pending}>
                    <BusyLabel
                      busy={create.pending}
                      label="Create key"
                      busyLabel="Creating..."
                    />
                  </Button>
                }
              />
            )}
          </form.AppField>
          {create.errorMessage && <ErrorAlert message={create.errorMessage} />}
        </SettingsSection>
      </form.Form>
    </form.AppForm>
  )
}

export function CreateKeySectionSkeleton() {
  return (
    <SettingsSectionSkeleton>
      <FieldRowSkeleton control="input" description={false} action />
    </SettingsSectionSkeleton>
  )
}
