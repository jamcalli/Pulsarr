import { useStore } from '@tanstack/react-form'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { SaveBar } from '@/components/settings/save-bar'
import { EnrollmentCredenza } from '@/features/library/components/session-monitoring/enrollment-credenza'
import { RollingShowConfirm } from '@/features/library/components/session-monitoring/rolling-show-confirm'
import { RollingShowsCard } from '@/features/library/components/session-monitoring/rolling-shows-card'
import { SessionMonitoringSettings } from '@/features/library/components/session-monitoring/session-monitoring-settings'
import { SessionMonitoringSkeleton } from '@/features/library/components/session-monitoring/session-monitoring-skeleton'
import { StatusSection } from '@/features/library/components/session-monitoring/status-section'
import { useEnrollment } from '@/features/library/hooks/session-monitoring/useEnrollment'
import { useSessionMonitoringForm } from '@/features/library/hooks/session-monitoring/useSessionMonitoringForm'
import {
  type SessionMonitoringPage as MonitoringPage,
  useSessionMonitoringPage,
} from '@/features/library/hooks/session-monitoring/useSessionMonitoringPage'
import { monitoredUserOptions } from '@/features/library/lib/session-monitoring/monitored-users'
import { savedSessionMonitoring } from '@/features/library/lib/session-monitoring/saved-settings'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Library'
const TITLE = NAV_PAGES.sessionMonitoring.label
const DESCRIPTION = 'Ask Sonarr for the next season before people reach it.'

function SessionMonitoring({
  page,
  config,
}: {
  page: MonitoringPage
  config: components['schemas']['Config']
}) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useSessionMonitoringForm(config)
  const guard = useLeaveGuard(dirty)
  const enrollment = useEnrollment()
  const { users } = useUserDirectory()
  const invalid = useStore(form.store, (state) => !state.isValid)

  const settings = savedSessionMonitoring(config)
  const showRolling = settings.enabled || (page.all ?? []).length > 0

  return (
    <Page wide>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      {settings.enabled && (
        <StatusSection
          dirty={dirty}
          pollingMinutes={settings.pollingIntervalMinutes}
        />
      )}
      {showRolling && (
        <RollingShowsCard
          page={page}
          enabled={settings.enabled}
          inactivityDays={settings.inactivityResetDays}
          remainingEpisodes={settings.remainingEpisodes}
          onManage={enrollment.openCredenza}
        />
      )}
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <SessionMonitoringSettings
            form={form}
            fields="plexSessionMonitoring"
            userOptions={monitoredUserOptions(users)}
          />
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
            saveDisabled={invalid}
          />
        </form.Form>
      </form.AppForm>
      <RollingShowConfirm
        page={page}
        inactivityDays={settings.inactivityResetDays}
      />
      <EnrollmentCredenza enrollment={enrollment} />
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

export default function SessionMonitoringPage() {
  const page = useSessionMonitoringPage()

  if (!page.isReady) return <SessionMonitoringSkeleton />

  if (page.errorMessage || !page.config) {
    return (
      <Page wide>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <RetryAlert
          message={page.errorMessage ?? "Couldn't load session monitoring."}
          onRetry={page.retry}
        />
      </Page>
    )
  }

  return <SessionMonitoring page={page} config={page.config} />
}
