import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsSection } from '@/components/settings/settings-section'
import { NewUserDefaultsSkeleton } from '@/features/users/components/new-user-defaults/new-user-defaults-skeleton'
import { QuotaCard } from '@/features/users/components/quota-card'
import { useNewUserDefaultsForm } from '@/features/users/hooks/new-user-defaults/useNewUserDefaultsForm'
import { useConfig } from '@/hooks/useConfig'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Users'
const TITLE = NAV_PAGES.newUserDefaults.label
const DESCRIPTION = 'The settings Plex users get when Pulsarr first adds them.'

function NewUserDefaults({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useNewUserDefaultsForm(config)
  const guard = useLeaveGuard(dirty)

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <SettingsSection
            title="Access"
            description="Whether new users sync and whether their requests need your approval."
          >
            <form.AppField name="newUserDefaultCanSync">
              {(field) => (
                <field.SwitchField
                  label="Sync watchlists"
                  description="Request what new users watchlist. Turn off to add them without syncing."
                />
              )}
            </form.AppField>
            <form.AppField name="newUserDefaultRequiresApproval">
              {(field) => (
                <field.SwitchField
                  label="Require approval"
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
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
          />
        </form.Form>
      </form.AppForm>
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

export default function NewUserDefaultsPage() {
  const { config, error, initialize } = useConfig()

  if (!config && error) {
    return (
      <Page>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <RetryAlert message={error} onRetry={() => initialize(true)} />
      </Page>
    )
  }
  if (!config) return <NewUserDefaultsSkeleton />
  return <NewUserDefaults config={config} />
}
