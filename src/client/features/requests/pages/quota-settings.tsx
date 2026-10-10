import {
  QUOTA_MONTHLY_RESET_DAY,
  QUOTA_USAGE_RETENTION_DAYS,
  QUOTA_WEEKLY_ROLLING_DAYS,
} from '@root/schemas/config/config.schema'
import { useStore } from '@tanstack/react-form'
import { ErrorAlert } from '@/components/error-alert'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { SaveBar } from '@/components/settings/save-bar'
import { ScheduledJobPanel } from '@/components/settings/scheduled-job-panel'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { Button } from '@/components/ui/button'
import { useQuotaSettingsForm } from '@/features/requests/hooks/quota-settings/useQuotaSettingsForm'
import { NOTIFY_OPTIONS } from '@/features/requests/lib/notify-options'
import { QUOTA_SETTINGS_SKELETON } from '@/features/requests/lib/quota-settings-skeleton'
import { useConfig } from '@/hooks/useConfig'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useShowLoading } from '@/hooks/useMinLoading'
import { type ScheduleStatus, useSchedule } from '@/hooks/useSchedule'
import { NAV_PAGES } from '@/lib/navigation'
import { withStoredOption } from '@/lib/select-options'
import type { components } from '@/types/api.js'

const SECTION = 'Requests'
const TITLE = NAV_PAGES.quotas.label
const DESCRIPTION =
  'Set when quotas reset, clean up old usage history and choose who hears when a watchlist reaches its cap.'
const SCHEDULE_NAME = 'quota-maintenance'

const MONTH_END_OPTIONS = [
  {
    value: 'last-day',
    label: 'Reset on the last day',
    description: 'A month without that day resets on its last day.',
  },
  {
    value: 'skip-month',
    label: 'Skip that month',
    description:
      'A month without that day has no reset, so requests keep counting until the next one.',
  },
  {
    value: 'next-month',
    label: 'Reset on the 1st',
    description:
      'A month without that day resets on the 1st of the following month.',
  },
] as const satisfies Array<{
  value: components['schemas']['QuotaMonthEnd']
  label: string
  description: string
}>

function QuotaSettings({
  config,
  schedule,
  run,
}: {
  config: components['schemas']['Config']
  schedule: ScheduleStatus
  run: ReturnType<typeof useSchedule>['run']
}) {
  const {
    configForm,
    scheduleForm,
    dirty,
    saving,
    saved,
    errorMessage,
    discard,
    submit,
  } = useQuotaSettingsForm(config, schedule)
  const guard = useLeaveGuard(dirty)
  const scheduleOn = useStore(
    scheduleForm.store,
    (state) => state.values.enabled,
  )
  const cleanupOn = useStore(
    configForm.store,
    (state) => state.values.quotaSettings.cleanup.enabled,
  )

  const notifyOptions = withStoredOption(
    NOTIFY_OPTIONS,
    config.watchlistCapNotify,
  )

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <configForm.AppForm>
        <configForm.Form className="flex flex-col gap-5" submit={submit}>
          <ScheduledJobPanel
            title="Quota maintenance"
            description="Deletes old usage history on a schedule."
            schedule={schedule}
            dirty={dirty}
            run={run}
          >
            <scheduleForm.AppField name="enabled">
              {(field) => (
                <field.SwitchField
                  label="Run on a schedule"
                  description="Turn off to pause automatic runs."
                />
              )}
            </scheduleForm.AppField>
            <scheduleForm.AppField name="expression">
              {(field) => (
                <field.ScheduleField
                  label="Run at"
                  description="In the server's time zone."
                  disabled={!scheduleOn}
                />
              )}
            </scheduleForm.AppField>
          </ScheduledJobPanel>
          <SettingsSection
            title="Weekly rolling"
            description="A weekly rolling quota counts requests over a sliding run of days."
          >
            <configForm.AppField name="quotaSettings.weeklyRolling.resetDays">
              {(field) => (
                <field.NumberField
                  label="Count requests from the last"
                  description="Includes today. A request stops counting this many days after it was made."
                  unit="day"
                  min={QUOTA_WEEKLY_ROLLING_DAYS.min}
                  max={QUOTA_WEEKLY_ROLLING_DAYS.max}
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="Monthly"
            description="A monthly quota resets at midnight server time on the day you choose."
          >
            <configForm.AppField name="quotaSettings.monthly.resetDay">
              {(field) => (
                <field.NumberField
                  label="Reset on day"
                  description="The day of the month when usage starts over."
                  min={QUOTA_MONTHLY_RESET_DAY.min}
                  max={QUOTA_MONTHLY_RESET_DAY.max}
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="quotaSettings.monthly.handleMonthEnd">
              {(field) => (
                <field.RadioField
                  label="When a month is too short"
                  description="Only matters when the reset day is the 29th or later."
                  options={MONTH_END_OPTIONS}
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="Usage history"
            description="Each request a quota counts is kept as a usage record."
          >
            <configForm.AppField name="quotaSettings.cleanup.enabled">
              {(field) => (
                <field.SwitchField
                  label="Delete old usage history"
                  description="Each maintenance run deletes records older than the retention period."
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="quotaSettings.cleanup.retentionDays">
              {(field) => (
                <field.NumberField
                  label="Keep usage history for"
                  description="At least your longest quota period, or cleanup deletes requests that still count."
                  unit="day"
                  min={QUOTA_USAGE_RETENTION_DAYS.min}
                  max={QUOTA_USAGE_RETENTION_DAYS.max}
                  disabled={!cleanupOn}
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="Watchlist cap notifications"
            description="Who hears when a user's watchlist reaches its cap."
          >
            <configForm.AppField name="watchlistCapNotify">
              {(field) => (
                <field.SelectField
                  label="Send cap notifications to"
                  options={notifyOptions}
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="watchlistCapNotifyUser">
              {(field) => (
                <field.SwitchField
                  label="Notify the user"
                  description="Also notifies the user by Discord or Apprise, if they use them."
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
          />
        </configForm.Form>
      </configForm.AppForm>
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </Page>
  )
}

export default function QuotaSettingsPage() {
  const { config, error, initialize } = useConfig()
  const job = useSchedule(SCHEDULE_NAME, {
    label: 'Quota maintenance',
    page: NAV_PAGES.quotas,
  })
  const loaded = config !== null && job.schedule !== null
  const showLoading = useShowLoading(!loaded)
  const loadError =
    (!config && error) || (!job.schedule && job.errorMessage) || null

  if (loadError) {
    return (
      <Page>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <ErrorAlert message={loadError} />
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={() => {
            if (!config) initialize(true)
            if (!job.schedule) job.retry()
          }}
        >
          Retry
        </Button>
      </Page>
    )
  }
  if (showLoading) {
    return <SettingsPageSkeleton {...QUOTA_SETTINGS_SKELETON} />
  }
  if (!config || !job.schedule) return null
  return <QuotaSettings config={config} schedule={job.schedule} run={job.run} />
}
