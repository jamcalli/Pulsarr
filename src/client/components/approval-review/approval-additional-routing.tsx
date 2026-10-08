import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ApprovalReview } from '@/hooks/useApprovalReview'
import { useArrInstances } from '@/hooks/useArrInstances'
import { useQualityProfileNames } from '@/hooks/useQualityProfileNames'
import { type ArrTarget, additionalRouting } from '@/lib/approval'
import { formatList } from '@/lib/format'
import { $api } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type ApprovalRouting = components['schemas']['ApprovalRouting']

function entryKey(entry: ApprovalRouting) {
  return `${entry.instanceId}:${entry.ruleId ?? ''}`
}

interface ApprovalAdditionalRoutingProps {
  approval: ApprovalRequest
  review: ApprovalReview
  type: ArrTarget['type']
}

export function ApprovalAdditionalRouting({
  approval,
  review,
  type,
}: ApprovalAdditionalRoutingProps) {
  const entries = additionalRouting(approval.proposedRouterDecision)
  const instances = useArrInstances(type)
  const profiles = useQualityProfileNames(
    type,
    entries.map((entry) => entry.instanceId),
  )
  const rulesQuery = $api.useQuery(
    'get',
    '/v1/content-router/rules',
    undefined,
    { enabled: entries.length > 0 },
  )
  const removable = approval.status === 'pending'
  const removeDisabled = review.busy !== null || review.stage !== 'review'

  if (entries.length === 0) return null

  if (profiles.isLoading || rulesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        {entries.map((entry) => (
          <div key={entryKey(entry)} className="flex flex-col gap-1">
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    )
  }

  const rules = rulesQuery.data?.rules ?? []
  const lines = entries.map((entry, index) => {
    const instance = instances.findTarget(entry.instanceId)?.instance ?? null
    const profile = entry.qualityProfile ?? instance?.qualityProfile ?? null
    const profileLabel =
      profile === null ? null : profiles.profileName(entry.instanceId, profile)
    const folder = entry.rootFolder || instance?.rootFolder || null
    const detail = [profileLabel, folder].filter((part): part is string =>
      Boolean(part),
    )
    return {
      key: entryKey(entry),
      index,
      name: instance?.name ?? `Instance ${entry.instanceId}`,
      detail: detail.length ? formatList(detail) : null,
      rule: rules.find((rule) => rule.id === entry.ruleId)?.name ?? null,
    }
  })

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Other destinations</p>
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li key={line.key} className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="break-words text-muted-foreground">
                <span className="font-bold text-foreground">{line.name}</span>
                {line.detail && `, ${line.detail}`}
              </span>
              {line.rule && (
                <span className="text-sm text-muted-foreground">
                  Rule: {line.rule}
                </span>
              )}
            </div>
            {removable && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${line.name}`}
                disabled={removeDisabled}
                onClick={() => review.removeAdditionalRouting(line.index)}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
