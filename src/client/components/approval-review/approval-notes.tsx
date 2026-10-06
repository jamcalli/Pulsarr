import { useId } from 'react'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import type { ApprovalReview } from '@/hooks/useApprovalReview'
import { useApprovalTarget } from '@/hooks/useApprovalTarget'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

const RECORD_HELP =
  'Kept with this request and included in webhook notifications. The requester is never told.'

interface RecordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}

function RecordField({ label, value, onChange, disabled }: RecordFieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>
        {label}
        <span className="font-normal text-muted-foreground">Optional</span>
      </FieldLabel>
      <Textarea
        id={id}
        rows={2}
        value={value}
        disabled={disabled}
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldDescription id={helpId}>{RECORD_HELP}</FieldDescription>
    </Field>
  )
}

interface ApprovalNotesProps {
  approval: ApprovalRequest
  review: ApprovalReview
}

export function ApprovalNotes({ approval, review }: ApprovalNotesProps) {
  const { routing, target } = useApprovalTarget(approval)
  const busy = review.busy !== null

  if (review.stage !== 'deny') {
    return (
      <RecordField
        label="Notes (for your records)"
        value={review.notes}
        onChange={review.setNotes}
        disabled={busy}
      />
    )
  }

  const instanceName = target?.instance.name ?? 'the instance'
  const denySub = routing
    ? `Nothing is sent to ${instanceName}. The request moves to your history as denied.`
    : 'The request moves to your history as denied.'

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading font-bold">Deny this request?</h3>
        <p className="text-muted-foreground">{denySub}</p>
      </div>
      <RecordField
        label="Reason (for your records)"
        value={review.reason}
        onChange={review.setReason}
        disabled={busy}
      />
    </section>
  )
}
