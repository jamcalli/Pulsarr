import { ConfirmCredenza } from '@/components/confirm-credenza'
import type {
  SessionMonitoringPage,
  ShowConfirm,
} from '@/features/library/hooks/session-monitoring/useSessionMonitoringPage'
import {
  resetInactiveCopy,
  resetShowCopy,
  stopRollingCopy,
} from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import { formatCount } from '@/lib/format'

interface ConfirmCopy {
  title: string
  paragraphs: [string, string]
  confirmLabel: string
  pendingLabel: string
  variant: 'default' | 'destructive'
  cancelLabel?: string
}

function confirmCopy(target: ShowConfirm, inactivityDays: number): ConfirmCopy {
  if (target.kind === 'resetInactive') {
    const { titles } = target
    return {
      title: `Reset ${formatCount(titles.length, 'inactive show')}`,
      paragraphs: resetInactiveCopy(titles, inactivityDays),
      confirmLabel: `Reset ${formatCount(titles.length, 'show')}`,
      pendingLabel: 'Resetting...',
      variant: 'destructive',
    }
  }
  const { record, instanceName, viewers } = target.row
  if (target.kind === 'reset') {
    return {
      title: `Reset ${record.show_title}`,
      paragraphs: resetShowCopy(
        record.show_title,
        record.monitoring_type,
        instanceName,
        viewers.length,
      ),
      confirmLabel: `Reset ${record.show_title}`,
      pendingLabel: 'Resetting...',
      variant: 'destructive',
    }
  }
  return {
    title: `Stop rolling ${record.show_title}`,
    paragraphs: stopRollingCopy(record.show_title, instanceName),
    confirmLabel: 'Stop rolling',
    pendingLabel: 'Stopping...',
    variant: 'default',
    cancelLabel: 'Keep rolling',
  }
}

export function RollingShowConfirm({
  page,
  inactivityDays,
}: {
  page: SessionMonitoringPage
  inactivityDays: number
}) {
  const { open, target } = page.confirm
  if (!target) return null
  const copy = confirmCopy(target, inactivityDays)
  const [what, lost] = copy.paragraphs

  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={page.setConfirmOpen}
      title={copy.title}
      description={what}
      confirmLabel={copy.confirmLabel}
      confirmVariant={copy.variant}
      cancelLabel={copy.cancelLabel}
      pending={page.actionPending}
      pendingLabel={copy.pendingLabel}
      errorMessage={page.actionError}
      onConfirm={page.runConfirm}
    >
      <p className="text-muted-foreground">{lost}</p>
    </ConfirmCredenza>
  )
}
