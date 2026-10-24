import { useStore } from '@tanstack/react-form'
import { ConfigPageGate } from '@/components/config-page-gate'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill } from '@/components/status-pill'
import { AppriseServerSection } from '@/features/notifications/components/apprise/apprise-server-section'
import { useAppriseForm } from '@/features/notifications/hooks/apprise/useAppriseForm'
import {
  APPRISE_STATUS_PILLS,
  appriseLockReason,
  appriseStatusFromConfig,
} from '@/features/notifications/lib/apprise'
import { APPRISE_SKELETON } from '@/features/notifications/lib/apprise-skeleton'
import { useAppriseStatus } from '@/hooks/useAppriseStatus'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { NAV_PAGES } from '@/lib/navigation'
import { testApprise, testSystemTarget } from '@/lib/notification-tests'
import { appriseRowError, firstRowError } from '@/lib/notification-urls'
import type { components } from '@/types/api.js'

const SECTION = 'Notifications'
const TITLE = NAV_PAGES.apprise.label
const DESCRIPTION = 'Choose where admin notifications go through Apprise.'

function AppriseSettings({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useAppriseForm(config)
  const guard = useLeaveGuard(dirty)
  const status = useAppriseStatus() ?? appriseStatusFromConfig(config)
  const pill = APPRISE_STATUS_PILLS[status]
  const lockReason = appriseLockReason(status)
  const saveError = useStore(form.store, (state) =>
    firstRowError(state.values.systemAppriseUrl, appriseRowError),
  )

  return (
    <Page>
      <PageHeader
        section={SECTION}
        title={TITLE}
        description={DESCRIPTION}
        action={<StatusPill tone={pill.tone} label={pill.label} live />}
      />
      <AppriseServerSection status={status} serverUrl={config.appriseUrl} />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <SettingsSection
            title="System notifications"
            description="Where Pulsarr sends admin notifications through Apprise."
            lock={lockReason ? { reason: lockReason } : undefined}
          >
            <form.AppField name="appriseEmailSender">
              {(field) => (
                <field.SecretField
                  label="Email sender"
                  description="A mailtos:// URL so targets can be plain email addresses."
                  placeholder="mailtos://user:password@gmail.com"
                  orientation="vertical"
                  revealLabel={{
                    show: 'Show email sender',
                    hide: 'Hide email sender',
                  }}
                  disabled={lockReason !== null}
                />
              )}
            </form.AppField>
            <form.AppField name="systemAppriseUrl">
              {(field) => (
                <field.UrlListField
                  label="Apprise URLs"
                  description="Apprise URLs or email addresses for admin notifications."
                  placeholder="tgram://... or name@example.com"
                  masked
                  disabled={lockReason !== null}
                  saved={config.systemAppriseUrl ?? ''}
                  validateRow={appriseRowError}
                  testUrl={testApprise}
                  testSaved={() => testSystemTarget('systemApprise')}
                />
              )}
            </form.AppField>
          </SettingsSection>
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
            message={saveError ?? undefined}
            saveDisabled={saveError !== null}
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

export default function ApprisePage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<SettingsPageSkeleton {...APPRISE_SKELETON} />}
    >
      {(config) => <AppriseSettings config={config} />}
    </ConfigPageGate>
  )
}
