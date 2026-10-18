import { ConfigPageGate } from '@/components/config-page-gate'
import { ExternalLink } from '@/components/external-link'
import { LeaveDialog } from '@/components/leave-dialog'
import { NavPageButton } from '@/components/nav-page-button'
import { Page, PageHeader } from '@/components/page-header'
import { InfoLine } from '@/components/settings/info-line'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill } from '@/components/status-pill'
import { TestPush } from '@/features/notifications/components/plex-mobile/test-push'
import { usePlexMobileForm } from '@/features/notifications/hooks/plex-mobile/usePlexMobileForm'
import {
  PLEX_MOBILE_DOCS_URL,
  PLEX_MOBILE_STATUS_PILLS,
  plexMobileLockReason,
  pushTestUnavailableReason,
} from '@/features/notifications/lib/plex-mobile'
import { PLEX_MOBILE_SKELETON } from '@/features/notifications/lib/plex-mobile-skeleton'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { usePlexMobileStatus } from '@/hooks/usePlexMobileStatus'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Notifications'
const TITLE = NAV_PAGES.plexMobile.label
const DESCRIPTION = 'Push alerts to users in the Plex app.'

function PlexMobileSettings({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    usePlexMobileForm(config)
  const guard = useLeaveGuard(dirty)
  const status = usePlexMobileStatus()
  const pill = status ? PLEX_MOBILE_STATUS_PILLS[status] : null
  const lockReason = status ? plexMobileLockReason(status) : null
  const lock = lockReason
    ? {
        reason: lockReason,
        action:
          status === 'not_configured' ? (
            <NavPageButton page={NAV_PAGES.plexConnection} />
          ) : undefined,
      }
    : undefined

  return (
    <Page>
      <PageHeader
        section={SECTION}
        title={TITLE}
        description={DESCRIPTION}
        action={pill && <StatusPill tone={pill.tone} label={pill.label} live />}
      />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <SettingsSection title="Push to the Plex app" lock={lock}>
            <form.AppField name="plexMobileEnabled">
              {(field) => (
                <field.SwitchField
                  label="Send to Plex mobile apps"
                  description="Users can still turn it off on their own profile."
                  disabled={lock !== undefined}
                />
              )}
            </form.AppField>
            <TestPush
              disabled={lock !== undefined}
              unavailableReason={
                lock
                  ? null
                  : pushTestUnavailableReason(
                      status,
                      config.plexMobileEnabled,
                      dirty,
                    )
              }
            />
            <InfoLine
              action={
                <ExternalLink href={PLEX_MOBILE_DOCS_URL}>
                  Plex app settings
                </ExternalLink>
              }
            >
              Pushes need notifications on in the Plex app, and turning off
              Plex's own new-content alerts avoids duplicates.
            </InfoLine>
          </SettingsSection>
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

export default function PlexMobilePage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<SettingsPageSkeleton {...PLEX_MOBILE_SKELETON} />}
    >
      {(config) => <PlexMobileSettings config={config} />}
    </ConfigPageGate>
  )
}
