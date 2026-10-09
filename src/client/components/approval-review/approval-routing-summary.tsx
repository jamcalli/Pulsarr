import { CircleCheck } from 'lucide-react'
import { ApprovalAdditionalRouting } from '@/components/approval-review/approval-additional-routing'
import { ApprovalRoutingForm } from '@/components/approval-review/approval-routing-form'
import { FactList } from '@/components/fact-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ApprovalReview } from '@/hooks/useApprovalReview'
import { useApprovalTarget } from '@/hooks/useApprovalTarget'
import { useArrInstanceOptions } from '@/hooks/useArrInstanceOptions'
import { routingFacts, routingHeading } from '@/lib/approval'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

interface ApprovalRoutingSummaryProps {
  approval: ApprovalRequest
  review: ApprovalReview
}

export function ApprovalRoutingSummary({
  approval,
  review,
}: ApprovalRoutingSummaryProps) {
  const { routing, type, instances, target } = useApprovalTarget(approval)
  const options = useArrInstanceOptions(
    type,
    routing?.instanceId ?? null,
    routing !== null,
  )
  const editable = review.editable
  const canEdit =
    editable &&
    routing !== null &&
    review.stage === 'review' &&
    review.busy === null
  const heading = (
    <div className="flex min-h-8 items-center gap-3">
      <h3 className="flex-1 font-heading font-bold">
        {routingHeading(approval.status)}
      </h3>
      {canEdit && (
        <Button variant="neutral" size="sm" onClick={review.startEdit}>
          Edit routing
        </Button>
      )}
    </div>
  )

  if (editable && review.stage === 'edit') {
    return (
      <section className="flex flex-col gap-3">
        {heading}
        <ApprovalRoutingForm approval={approval} review={review} />
      </section>
    )
  }

  if (!routing) {
    return (
      <section className="flex flex-col gap-3">
        {heading}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-bold">No routing was saved with this request</p>
            <p className="text-muted-foreground">
              Pulsarr needs an instance to send it to. Set one before you
              approve.
            </p>
          </div>
          {editable && (
            <Button
              variant="neutral"
              className="self-start"
              disabled={review.busy !== null}
              onClick={review.startEdit}
            >
              Set routing
            </Button>
          )}
        </div>
      </section>
    )
  }

  const isDefault = target?.instance.isDefault ?? false
  const syncedNames =
    isDefault && instances.targets.length > 1
      ? (routing.syncedInstances ?? []).map(
          (id) => instances.findTarget(id)?.instance.name ?? `Instance ${id}`,
        )
      : null
  const instanceFact = {
    label: 'Instance',
    value: (
      <span className="flex flex-wrap items-center gap-2">
        {target?.instance.name ?? `Instance ${routing.instanceId}`}
        {isDefault && <Badge variant="secondary">Default</Badge>}
      </span>
    ),
  }
  const facts = [
    instanceFact,
    ...routingFacts({
      routing,
      qualityProfiles: options.qualityProfiles,
      tags: options.tags,
      syncedNames,
    }),
  ]

  return (
    <section className="flex flex-col gap-3">
      {heading}
      <FactList facts={facts} />
      <ApprovalAdditionalRouting
        approval={approval}
        review={review}
        type={type}
      />
      {review.routingSaved && (
        <p
          role="status"
          className="flex items-center gap-2 text-muted-foreground"
        >
          <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
          Changes saved
        </p>
      )}
    </section>
  )
}
