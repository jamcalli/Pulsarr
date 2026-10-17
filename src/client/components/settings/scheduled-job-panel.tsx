import type { ReactNode } from 'react'
import { FactList } from '@/components/fact-list'
import { ActionResults } from '@/components/settings/action-results'
import {
  type ActionProgress,
  ActionRow,
} from '@/components/settings/action-row'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill, type StatusPillView } from '@/components/status-pill'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import type { ActionState } from '@/lib/action-state'
import { formatRelative } from '@/lib/format'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'

interface ScheduledRun {
  running: boolean
  errorMessage: string | null
  run: () => void
  progress?: ActionProgress[]
  unavailableReason?: string | null
}

interface ScheduledJobPanelProps {
  title: string
  description: string
  /** The saved schedule, never the unsaved form values. */
  schedule: ScheduleStatus
  dirty: boolean
  run: ScheduledRun
  /** False when Run now bypasses the scheduler, so a disabled schedule does not lock it. */
  requiresSchedule?: boolean
  result?: ActionState['result']
  children: ReactNode
}

function jobStatus(schedule: ScheduleStatus, running: boolean): StatusPillView {
  if (running) return { tone: 'requested', label: 'Running' }
  if (!schedule.enabled) return { tone: 'off', label: 'Disabled' }
  if (schedule.last_run?.status === 'failed') {
    return { tone: 'failed', label: 'Last run failed' }
  }
  return { tone: 'on', label: 'Enabled' }
}

function lockReason(
  schedule: ScheduleStatus,
  dirty: boolean,
  requiresSchedule: boolean,
): string | null {
  if (dirty) return UNSAVED_CHANGES_REASON
  if (requiresSchedule && !schedule.enabled) {
    return 'Turn on the schedule to run it now.'
  }
  return null
}

export function ScheduledJobPanel({
  title,
  description,
  schedule,
  dirty,
  run,
  requiresSchedule = true,
  result,
  children,
}: ScheduledJobPanelProps) {
  const status = jobStatus(schedule, run.running)
  const reason = lockReason(schedule, dirty, requiresSchedule)
  const lastRun = schedule.last_run
  const lastRunFailed = lastRun?.status === 'failed'
  const lastRunText = lastRun
    ? `${lastRunFailed ? 'Failed ' : ''}${formatRelative(new Date(lastRun.time))}`
    : 'Never'
  const nextRunText =
    schedule.enabled && schedule.next_run
      ? formatRelative(new Date(schedule.next_run.time))
      : 'Not scheduled'
  const errorMessage =
    run.errorMessage ?? (lastRunFailed ? (lastRun.error ?? null) : null)

  return (
    <SettingsSection
      title={title}
      description={description}
      action={<StatusPill tone={status.tone} label={status.label} />}
      lock={reason ? { reason } : undefined}
    >
      <ActionRow
        title="Manual run"
        description="Runs it once now, outside the schedule."
        buttonLabel="Run now"
        busyLabel="Running..."
        disabled={reason !== null || Boolean(run.unavailableReason)}
        unavailableReason={run.unavailableReason}
        running={run.running}
        onRun={() => run.run()}
        progress={run.progress}
        result={
          <>
            <FactList
              facts={[
                { label: 'Last run', value: lastRunText },
                { label: 'Next run', value: nextRunText },
              ]}
            />
            {result && (
              <ActionResults ranAt={result.ranAt} rows={result.rows} />
            )}
          </>
        }
        errorMessage={errorMessage}
      />
      {children}
    </SettingsSection>
  )
}
