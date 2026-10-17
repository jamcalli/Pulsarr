import {
  APPROVAL_EXPIRATION_HOURS,
  EXPIRED_APPROVAL_CLEANUP_DAYS,
} from '@root/schemas/config/config.schema'
import { useStore } from '@tanstack/react-form'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { SaveBar } from '@/components/settings/save-bar'
import { ScheduledJobPanel } from '@/components/settings/scheduled-job-panel'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { useApprovalSettingsForm } from '@/features/requests/hooks/approval-settings/useApprovalSettingsForm'
import { APPROVAL_SETTINGS_SKELETON } from '@/features/requests/lib/approval-settings-skeleton'
import { useConfig } from '@/hooks/useConfig'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useShowLoading } from '@/hooks/useMinLoading'
import { type ScheduleStatus, useSchedule } from '@/hooks/useSchedule'
import { NAV_PAGES } from '@/lib/navigation'
import { notifyOptions } from '@/lib/notify-labels'
import { intervalOptions } from '@/lib/schedule'
import type { components } from '@/types/api.js'

const SECTION = 'Requests'
const TITLE = 'Approval settings'
const DESCRIPTION =
  'Decide when held requests expire, what happens to them, and who hears about them.'
const SCHEDULE_NAME = 'approval-maintenance'

const EXPIRATION_ACTION_OPTIONS = [
  {
    value: 'expire',
    label: 'Mark as expired',
    description: 'The request closes and nothing is sent to Sonarr or Radarr.',
  },
  {
    value: 'auto_approve',
    label: 'Approve automatically',
    description: 'The request is approved and sent where it was routed.',
  },
] as const satisfies Array<{
  value: string
  label: string
  description: string
}>

function ApprovalSettings({
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
  } = useApprovalSettingsForm(config, schedule)
  const guard = useLeaveGuard(dirty)
  const scheduleOn = useStore(
    scheduleForm.store,
    (state) => state.values.enabled,
  )
  const expirationOn = useStore(
    configForm.store,
    (state) => state.values.approvalExpiration.enabled,
  )

  const savedExpression =
    schedule.type === 'cron' ? schedule.config.expression : ''

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <configForm.AppForm>
        <configForm.Form className="flex flex-col gap-5" submit={submit}>
          <ScheduledJobPanel
            title="Approval maintenance"
            description="Expires requests nobody decided on and deletes old expired records."
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
                <field.SelectField
                  label="Run every"
                  description="How often it looks for requests to expire and records to delete."
                  options={intervalOptions(savedExpression)}
                  disabled={!scheduleOn}
                />
              )}
            </scheduleForm.AppField>
          </ScheduledJobPanel>
          <SettingsSection
            title="Expiration"
            description="What happens to requests nobody decides on."
          >
            <configForm.AppField name="approvalExpiration.enabled">
              {(field) => (
                <field.SwitchField
                  label="Expire approval requests"
                  description="Close pending requests that wait too long for a decision."
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="approvalExpiration.defaultExpirationHours">
              {(field) => (
                <field.NumberField
                  label="Expire after"
                  description="How long a request can wait before it expires."
                  unit="hour"
                  min={APPROVAL_EXPIRATION_HOURS.min}
                  max={APPROVAL_EXPIRATION_HOURS.max}
                  disabled={!expirationOn}
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="approvalExpiration.expirationAction">
              {(field) => (
                <field.RadioField
                  label="When a request expires"
                  options={EXPIRATION_ACTION_OPTIONS}
                  disabled={!expirationOn}
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="approvalExpiration.autoApproveOnQuotaAvailable">
              {(field) => (
                <field.SwitchField
                  label="Approve automatically when a quota resets"
                  description="Approves requests held for quota, oldest first, once the user has room again."
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="Notifications"
            description="Where admins hear about requests that need a decision."
          >
            <configForm.AppField name="approvalNotify">
              {(field) => (
                <field.SelectField
                  label="Send approval notifications to"
                  options={notifyOptions(config.approvalNotify)}
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="Cleanup"
            description="Keeps request history from growing forever."
          >
            <configForm.AppField name="approvalExpiration.cleanupExpiredDays">
              {(field) => (
                <field.NumberField
                  label="Delete expired records after"
                  description="Expired requests older than this are removed from history."
                  unit="day"
                  min={EXPIRED_APPROVAL_CLEANUP_DAYS.min}
                  max={EXPIRED_APPROVAL_CLEANUP_DAYS.max}
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

export default function ApprovalSettingsPage() {
  const { config, error, initialize } = useConfig()
  const job = useSchedule(SCHEDULE_NAME, {
    label: 'Approval maintenance',
    page: NAV_PAGES.approvalSettings,
  })
  const loaded = config !== null && job.schedule !== null
  const showLoading = useShowLoading(!loaded)
  const loadError =
    (!config && error) || (!job.schedule && job.errorMessage) || null

  if (loadError) {
    return (
      <Page>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <RetryAlert
          message={loadError}
          onRetry={() => {
            if (!config) initialize(true)
            if (!job.schedule) job.retry()
          }}
        />
      </Page>
    )
  }
  if (showLoading) {
    return <SettingsPageSkeleton {...APPROVAL_SETTINGS_SKELETON} />
  }
  if (!config || !job.schedule) return null
  return (
    <ApprovalSettings config={config} schedule={job.schedule} run={job.run} />
  )
}
