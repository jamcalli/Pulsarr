import { QuotaCard } from '@/components/quota/quota-card'
import { SettingsSection } from '@/components/settings/settings-section'
import type { useNewUserDefaultsForm } from '@/hooks/useNewUserDefaultsForm'
import { USER_SWITCH_LABELS } from '@/lib/user-switches'

export function NewUserDefaultsFields({
  form,
}: {
  form: ReturnType<typeof useNewUserDefaultsForm>['form']
}) {
  return (
    <>
      <SettingsSection
        title="Access"
        description="Whether new users sync and whether their requests need your approval."
      >
        <form.AppField name="newUserDefaultCanSync">
          {(field) => (
            <field.SwitchField
              label={USER_SWITCH_LABELS.can_sync}
              description="Request what new users watchlist. Turn off to add them without syncing."
            />
          )}
        </form.AppField>
        <form.AppField name="newUserDefaultRequiresApproval">
          {(field) => (
            <field.SwitchField
              label={USER_SWITCH_LABELS.requires_approval}
              description="Every request waits for your approval, whatever their quota."
            />
          )}
        </form.AppField>
      </SettingsSection>
      <QuotaCard
        form={form}
        fields="movie"
        type="movie"
        description="The movie quota new users start with."
      />
      <QuotaCard
        form={form}
        fields="show"
        type="show"
        description="The show quota new users start with."
      />
    </>
  )
}
