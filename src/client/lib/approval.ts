import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder'
import {
  MINIMUM_AVAILABILITY_LABELS,
  RADARR_MONITOR_LABELS,
} from '@root/schemas/radarr/add-options.schema'
import { SERIES_TYPE_LABELS, seasonMonitoringLabel } from '@/lib/arr-labels'
import { CONTENT_TYPE_LABELS } from '@/lib/content-type'
import {
  formatCount,
  formatDateTime,
  formatList,
  formatNumber,
  formatRelative,
  pluralize,
} from '@/lib/format'
import type { components, paths } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type RouterDecision = ApprovalRequest['proposedRouterDecision']
type ApprovalRouting = NonNullable<RouterDecision['routing']>
type ApprovalTrigger = components['schemas']['ApprovalTrigger']
type QuotaType = components['schemas']['QuotaType']
type RadarrInstance =
  paths['/v1/radarr/instances']['get']['responses'][200]['content']['application/json'][number]
type SonarrInstance = components['schemas']['SonarrInstance']

export type ReviewStage = 'review' | 'edit' | 'deny'

export type ArrTarget =
  | { type: 'radarr'; instance: RadarrInstance }
  | { type: 'sonarr'; instance: SonarrInstance }

/** False for the unconfigured instance the server seeds, which can never receive content. */
export function isConfiguredTarget(target: ArrTarget): boolean {
  return target.instance.apiKey !== ARR_API_KEY_PLACEHOLDER
}

export const DEFAULT_ROUTE_PRIORITY = 50

const TRIGGER_LABELS: Record<ApprovalTrigger, string> = {
  quota_exceeded: 'Quota exceeded',
  router_rule: 'Router rule',
  manual_flag: 'Manual flag',
  content_criteria: 'Content criteria',
}

const QUOTA_PERIODS: Record<QuotaType, { label: string; window: string }> = {
  daily: { label: 'Daily', window: 'today' },
  weekly_rolling: { label: 'Weekly', window: 'in the last 7 days' },
  monthly: { label: 'Monthly', window: 'this month' },
}

type ApprovalStatus = ApprovalRequest['status']

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Denied',
  expired: 'Expired',
  auto_approved: 'Auto approved',
}

/** Mirrors the branch the server routes from on approve, so null means approve will be refused. */
export function proposedRouting(
  decision: RouterDecision,
): ApprovalRouting | null {
  if (decision.action === 'route') return decision.routing ?? null
  if (decision.action === 'require_approval') {
    return decision.approval?.proposedRouting ?? null
  }
  return null
}

/** Any action other than route becomes require_approval so the server reads the new routing back. */
export function withRouting(
  request: ApprovalRequest,
  routing: ApprovalRouting,
): RouterDecision {
  const decision = request.proposedRouterDecision
  if (decision.action === 'route') return { ...decision, routing }
  return {
    ...decision,
    action: 'require_approval',
    approval: {
      reason: request.approvalReason ?? '',
      triggeredBy: request.triggeredBy,
      data: {},
      ...decision.approval,
      proposedRouting: routing,
    },
  }
}

/** Destinations stored besides the primary one, each routed on approval. */
export function additionalRouting(decision: RouterDecision): ApprovalRouting[] {
  return decision.approval?.additionalRouting ?? []
}

/** Drops one additional destination and keeps the rest of the stored decision. */
export function withoutAdditionalRouting(
  request: ApprovalRequest,
  index: number,
): RouterDecision {
  const decision = request.proposedRouterDecision
  if (!decision.approval) return decision
  return {
    ...decision,
    approval: {
      ...decision.approval,
      additionalRouting: additionalRouting(decision).filter(
        (_, position) => position !== index,
      ),
    },
  }
}

export function triggerSummary(
  approval: ApprovalRequest,
  userName: string,
): { kind: string; line: string; reason: string | null } {
  const kind = TRIGGER_LABELS[approval.triggeredBy]
  const data = approval.proposedRouterDecision.approval?.data
  const fallback = { kind, line: approval.approvalReason ?? kind, reason: null }

  switch (approval.triggeredBy) {
    case 'quota_exceeded': {
      if (
        !data?.quotaType ||
        data.quotaUsage === undefined ||
        data.quotaLimit === undefined
      ) {
        return fallback
      }
      const period = QUOTA_PERIODS[data.quotaType]
      const noun = approval.contentType === 'movie' ? 'movie' : 'show'
      // Stored usage already counts the request awaiting approval.
      const used = data.quotaUsage - 1
      return {
        kind,
        line: `${period.label} quota: ${formatNumber(used)} of ${formatNumber(data.quotaLimit)} ${pluralize(data.quotaLimit, noun)} used`,
        reason: `${userName} has requested ${formatCount(used, noun)} ${period.window}.`,
      }
    }
    case 'router_rule': {
      if (!data?.criteriaValue) return fallback
      const defaultReason = `Approval required by router rule: ${data.criteriaValue}`
      return {
        kind,
        line: `Rule: ${data.criteriaValue}`,
        reason:
          approval.approvalReason && approval.approvalReason !== defaultReason
            ? approval.approvalReason
            : null,
      }
    }
    case 'manual_flag':
      if (data?.criteriaType === 'user_requires_approval') {
        return {
          kind,
          line: `Every request from ${userName} needs approval`,
          reason: null,
        }
      }
      return fallback
    case 'content_criteria':
      return fallback
  }
}

/** Null when expiration is disabled in config. */
export function expiryLine(
  approval: ApprovalRequest,
  now: number,
): { text: string; soon: boolean } | null {
  if (approval.timeUntilExpiration == null || !approval.expiresAt) return null
  return {
    text: `Expires ${formatRelative(new Date(approval.expiresAt), now)}`,
    soon: approval.expirationStatus === 'expiring_soon',
  }
}

export function defaultRouting(target: ArrTarget): ApprovalRouting {
  const { instance } = target
  const base = {
    instanceId: instance.id,
    instanceType: target.type,
    qualityProfile: instance.qualityProfile ?? null,
    rootFolder: instance.rootFolder ?? null,
    tags: instance.tags,
    priority: DEFAULT_ROUTE_PRIORITY,
    searchOnAdd: instance.searchOnAdd,
    syncedInstances: instance.syncedInstances?.length
      ? instance.syncedInstances
      : undefined,
  }
  if (target.type === 'radarr') {
    return {
      ...base,
      minimumAvailability: target.instance.minimumAvailability,
      monitor: target.instance.monitor,
    }
  }
  return {
    ...base,
    seasonMonitoring: target.instance.seasonMonitoring,
    seriesType: target.instance.seriesType,
  }
}

export function canApprove({
  stage,
  routing,
  busy,
}: {
  stage: ReviewStage
  routing: ApprovalRouting | null
  busy: boolean
}): boolean {
  return stage === 'review' && routing !== null && !busy
}

export function approveBlockedReason({
  stage,
  routing,
}: {
  stage: ReviewStage
  routing: ApprovalRouting | null
}): string | null {
  if (stage === 'edit') return 'Save or cancel your routing changes to approve.'
  if (routing === null) return 'Set routing to approve.'
  return null
}

/** Null while the request is still pending. */
export function decisionSummary(approval: ApprovalRequest): {
  label: string
  at: string
  noteLabel: string
  note: string | null
} | null {
  if (approval.status === 'pending') return null
  const decidedAt = new Date(approval.updatedAt)
  return {
    label: APPROVAL_STATUS_LABELS[approval.status],
    at: formatDateTime(decidedAt),
    noteLabel: approval.status === 'rejected' ? 'Reason' : 'Notes',
    note: approval.approvalNotes,
  }
}

export function requestedLine(
  approval: Pick<ApprovalRequest, 'contentType' | 'createdAt'>,
  userName: string,
  now?: number,
): string {
  return `${CONTENT_TYPE_LABELS[approval.contentType]}, requested by ${userName}, ${formatRelative(new Date(approval.createdAt), now)}`
}

export function routingHeading(status: ApprovalStatus): string {
  if (status === 'pending') return 'Where it will go'
  if (status === 'approved' || status === 'auto_approved')
    return 'Where it went'
  return 'Where it would have gone'
}

type Option = { value: string; label: string }

/** Unresolved options fall back to raw values or a tag count, and null syncedNames hides that row. */
export function routingFacts({
  routing,
  qualityProfiles,
  tags,
  syncedNames,
}: {
  routing: ApprovalRouting
  qualityProfiles: Option[]
  tags: Option[]
  syncedNames: string[] | null
}): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string | null | undefined }> = []
  const profile = routing.qualityProfile
  facts.push({
    label: 'Quality profile',
    value:
      profile == null
        ? 'Not set'
        : (qualityProfiles.find(
            (option) =>
              option.value === String(profile) ||
              option.label === String(profile),
          )?.label ?? String(profile)),
  })

  const tagIds = routing.tags ?? []
  const tagLabels = tagIds.map(
    (id) => tags.find((option) => option.value === id)?.label,
  )
  facts.push({
    label: 'Tags',
    value:
      tagIds.length === 0
        ? 'None'
        : tagLabels.every((label) => label !== undefined)
          ? formatList(tagLabels)
          : formatCount(tagIds.length, 'tag'),
  })
  facts.push({ label: 'Root folder', value: routing.rootFolder ?? 'Not set' })
  facts.push({
    label: 'Search on add',
    value:
      routing.searchOnAdd === false
        ? 'Add without searching'
        : 'Search as soon as it is added',
  })

  if (routing.instanceType === 'sonarr') {
    facts.push({
      label: 'Season monitoring',
      value: routing.seasonMonitoring
        ? seasonMonitoringLabel(routing.seasonMonitoring)
        : null,
    })
    facts.push({
      label: 'Series type',
      value: routing.seriesType ? SERIES_TYPE_LABELS[routing.seriesType] : null,
    })
  } else {
    facts.push({
      label: 'Minimum availability',
      value: routing.minimumAvailability
        ? MINIMUM_AVAILABILITY_LABELS[routing.minimumAvailability]
        : null,
    })
    facts.push({
      label: 'Monitor',
      value: routing.monitor ? RADARR_MONITOR_LABELS[routing.monitor] : null,
    })
  }

  if (syncedNames !== null) {
    facts.push({
      label: 'Also send to',
      value: syncedNames.length ? formatList(syncedNames) : 'None',
    })
  }

  return facts.flatMap(({ label, value }) => (value ? [{ label, value }] : []))
}
