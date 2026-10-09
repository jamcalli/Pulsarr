import { useId } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import type { ApprovalQueuePage } from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import { bulkConfirmCopy } from '@/features/requests/lib/approval-queue/bulk-actions'

export function BulkConfirm({ page }: { page: ApprovalQueuePage }) {
  const id = useId()
  const { action, count, open } = page.confirm
  const copy = bulkConfirmCopy(action, count, page.state.tab === 'history')

  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={(open) => {
        if (!open) page.cancelConfirm()
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      confirmVariant={copy.variant}
      pending={page.bulkPending}
      pendingLabel={copy.pendingLabel}
      onConfirm={page.runConfirmed}
    >
      {copy.noteLabel && (
        <Field>
          <FieldLabel htmlFor={id}>{copy.noteLabel}</FieldLabel>
          <Textarea
            id={id}
            rows={2}
            value={page.note}
            placeholder="Optional, saved on each request"
            disabled={page.bulkPending}
            onChange={(event) => page.setNote(event.target.value)}
          />
        </Field>
      )}
    </ConfirmCredenza>
  )
}
