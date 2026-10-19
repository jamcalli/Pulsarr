import { ErrorAlert } from '@/components/error-alert'
import { SeparatedList, SeparatedListRow } from '@/components/separated-list'
import { ActionResults } from '@/components/settings/action-results'
import { StatusPill } from '@/components/status-pill'
import { SyncStepProgress } from '@/components/sync-step-progress'
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/ui/item'
import {
  SYNC_ERROR_TITLES,
  SYNC_STATUS_PILLS,
  SYNC_STEP_LABELS,
  SYNC_STEP_PROGRESS,
  type SyncRun,
} from '@/lib/plex/sync-run'

export function SyncSteps({ run }: { run: SyncRun }) {
  const steps = (
    <SeparatedList label="Sync steps">
      {run.steps.map((step) => {
        const pill = SYNC_STATUS_PILLS[step.status]
        const label = SYNC_STEP_LABELS[step.id]
        const progressType =
          step.status === 'running' ? SYNC_STEP_PROGRESS[step.id] : undefined
        return (
          <SeparatedListRow key={step.id}>
            <ItemContent>
              <ItemTitle>{label}</ItemTitle>
              {progressType && <SyncStepProgress type={progressType} />}
              {step.detail && (
                <ItemDescription className="line-clamp-none">
                  {step.detail}
                </ItemDescription>
              )}
            </ItemContent>
            {!progressType && (
              <ItemActions>
                <StatusPill tone={pill.tone} label={pill.label} />
              </ItemActions>
            )}
          </SeparatedListRow>
        )
      })}
    </SeparatedList>
  )
  const error = run.error && (
    <ErrorAlert
      message={SYNC_ERROR_TITLES[run.error.step]}
      detail={run.error.message}
    />
  )

  if (run.ranAt === null) return steps
  return (
    <ActionResults ranAt={run.ranAt}>
      {steps}
      {error}
    </ActionResults>
  )
}
