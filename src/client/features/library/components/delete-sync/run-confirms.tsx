import { ConfirmCredenza } from '@/components/confirm-credenza'
import { Button } from '@/components/ui/button'
import { LatestDryRun } from '@/features/library/components/delete-sync/latest-dry-run'
import {
  runConfirmBody,
  scheduleConfirmBody,
} from '@/features/library/lib/delete-sync/delete-sync-copy'

interface RunNowConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deleteFiles: boolean
  /** The matching dry run's line, or null when none used the saved settings. */
  dryRunLine: string | null
  onDryRunFirst: () => void
  onConfirm: () => void
}

export function RunNowConfirm({
  open,
  onOpenChange,
  deleteFiles,
  dryRunLine,
  onDryRunFirst,
  onConfirm,
}: RunNowConfirmProps) {
  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={onOpenChange}
      title="Run delete sync now"
      description={runConfirmBody(deleteFiles)}
      confirmLabel="Run and delete"
      confirmVariant="destructive"
      onConfirm={onConfirm}
    >
      <LatestDryRun
        line={dryRunLine ?? 'No dry run matches the saved settings.'}
        action={
          dryRunLine === null && (
            <Button
              type="button"
              variant="neutral"
              size="sm"
              className="max-md:self-stretch"
              onClick={onDryRunFirst}
            >
              Dry run first
            </Button>
          )
        }
      />
    </ConfirmCredenza>
  )
}

interface ScheduleOnConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expression: string
  deleteFiles: boolean
  /** The matching dry run's line, or null when none used these settings. */
  dryRunLine: string | null
  onConfirm: () => void
}

export function ScheduleOnConfirm({
  open,
  onOpenChange,
  expression,
  deleteFiles,
  dryRunLine,
  onConfirm,
}: ScheduleOnConfirmProps) {
  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={onOpenChange}
      title="Turn on scheduled deletion"
      description={scheduleConfirmBody(expression, deleteFiles)}
      confirmLabel="Save and turn on"
      confirmVariant="destructive"
      onConfirm={onConfirm}
    >
      <p className="text-muted-foreground">
        Deleted content can't be restored from Pulsarr.
      </p>
      <LatestDryRun
        line={dryRunLine ?? 'No dry run matches these settings yet.'}
      />
    </ConfirmCredenza>
  )
}
