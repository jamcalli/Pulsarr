import { ErrorAlert } from '@/components/error-alert'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { Button } from '@/components/ui/button'
import { MediaDefaultsSection } from '@/features/users/components/new-user-defaults/media-defaults-section'
import { useNewUserDefaultsForm } from '@/features/users/hooks/new-user-defaults/useNewUserDefaultsForm'
import { NEW_USER_DEFAULTS_SKELETON } from '@/features/users/lib/new-user-defaults-skeleton'
import { useConfig } from '@/hooks/useConfig'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useShowLoading } from '@/hooks/useMinLoading'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Users'
const TITLE = NAV_PAGES.newUserDefaults.label
const DESCRIPTION =
  'The settings new Plex users start with. Changes apply to users added after you save, never to existing users.'

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
                  description="Requests what new users add to their watchlists. Turn off to add users without syncing them."
                />
              )}
            </form.AppField>
            <form.AppField name="newUserDefaultRequiresApproval">
              {(field) => (
                <field.SwitchField
                  label="Require approval"
                  description="Every request from a new user waits for your approval, whatever their quota."
                />
              )}
            </form.AppField>
          </SettingsSection>
          <MediaDefaultsSection
            form={form}
            fields="movie"
            title="Movies"
            description="The movie quota new users start with."
            unit="movie"
          />
          <MediaDefaultsSection
            form={form}
            fields="show"
            title="Shows"
            description="The show quota new users start with."
            unit="show"
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
  const showLoading = useShowLoading(config === null)

  if (!config && error) {
    return (
      <Page>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <ErrorAlert message={error} />
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={() => initialize(true)}
        >
          Retry
        </Button>
      </Page>
    )
  }
  if (showLoading) {
    return <SettingsPageSkeleton {...NEW_USER_DEFAULTS_SKELETON} />
  }
  if (!config) return null
  return <NewUserDefaults config={config} />
}
