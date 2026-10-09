import type {
  DiagnosticApproval,
  DiagnosticExclusion,
  DiagnosticInstance,
  DiagnosticPresence,
  DiagnosticState,
} from '@schemas/watchlist-diagnostics/watchlist-diagnostics.schema.js'
import { extractTmdbId, extractTvdbId } from '@utils/guid-handler.js'

export interface WorkflowSnapshot {
  status: string
  nextReconciliationAt: string | null
}

export interface DiagnosisContext {
  presence: DiagnosticPresence
  type: string
  /** Stored watchlist_items status, null when Pulsarr has no row */
  status: 'pending' | 'requested' | 'grabbed' | 'notified' | null
  guids: string[]
  instances: DiagnosticInstance[]
  approval: DiagnosticApproval | null
  exclusion: DiagnosticExclusion | null
  canSync: boolean
  /** The user's watchlist cap for this content type is exceeded */
  watchlistCapExceeded: boolean
  workflow: WorkflowSnapshot
  now: number
}

export interface Diagnosis {
  state: DiagnosticState
  reason: string
}

const ARR_LABEL = { radarr: 'Radarr', sonarr: 'Sonarr' } as const

const INSTANCE_STATUS_LABEL: Record<DiagnosticInstance['status'], string> = {
  pending: 'added, waiting to be grabbed',
  requested: 'requested',
  grabbed: 'grabbed',
  notified: 'available, user notified',
}

/** Plain-language timing for the next full reconciliation. */
export function describeNextReconciliation(
  workflow: WorkflowSnapshot,
  now: number,
): string {
  if (workflow.status !== 'running') {
    return 'the watchlist workflow is not running, so nothing new is picked up until it is started'
  }
  if (!workflow.nextReconciliationAt) {
    return 'it should be picked up by the next sync'
  }
  const minutes = Math.ceil(
    (Date.parse(workflow.nextReconciliationAt) - now) / 60_000,
  )
  if (!Number.isFinite(minutes)) {
    return 'it should be picked up by the next sync'
  }
  if (minutes <= 1) {
    return 'the next full reconciliation is due now'
  }
  return `the next full reconciliation is in ~${minutes} min`
}

function describeInstances(instances: DiagnosticInstance[]): string {
  return instances
    .map(
      (instance) =>
        `${ARR_LABEL[instance.arr]} "${instance.instanceName}" (${INSTANCE_STATUS_LABEL[instance.status]})`,
    )
    .join(', ')
}

function describePendingApproval(approval: DiagnosticApproval, type: string) {
  const detail = approval.reason ? ` (${approval.reason})` : ''
  switch (approval.triggeredBy) {
    case 'quota_exceeded':
      return `Awaiting admin approval: the user is over their ${type === 'show' ? 'show' : 'movie'} quota${detail}`
    case 'router_rule':
      return approval.ruleName
        ? `Awaiting admin approval: required by router rule "${approval.ruleName}"${detail}`
        : `Awaiting admin approval: required by a router rule${detail}`
    case 'manual_flag':
      return `Awaiting admin approval: this user needs approval for every request${detail}`
    case 'content_criteria':
      return `Awaiting admin approval: the content matched approval criteria${detail}`
  }
}

function describeMissingIds(type: string, guids: string[]): string | null {
  if (guids.length === 0) {
    return 'Plex has no external IDs (TMDB/TVDB/IMDb) for this item, so it cannot be routed until Plex matches it'
  }
  if (type === 'movie' && extractTmdbId(guids) === 0) {
    return 'No TMDB ID in the Plex metadata, so Radarr cannot add it (common for specials, shorts or unmatched items)'
  }
  if (type === 'show' && extractTvdbId(guids) === 0) {
    return 'No TVDB ID in the Plex metadata, so Sonarr cannot add it (common for specials, webisodes or unmatched shows)'
  }
  return null
}

function describeExclusion(exclusion: DiagnosticExclusion): Diagnosis {
  return exclusion.scope === 'global'
    ? {
        state: 'excluded_global',
        reason:
          'Excluded for all users by a global watchlist exclusion, so it is never routed',
      }
    : {
        state: 'excluded_user',
        reason:
          'Excluded for this user by a watchlist exclusion, so it is never routed for them',
      }
}

/**
 * Picks the single most useful explanation for one watchlist item. The
 * checks run in the order the sync and router apply them, so the first match
 * is the gate that actually stopped the item.
 */
export function diagnoseItem(ctx: DiagnosisContext): Diagnosis {
  const type = ctx.type.toLowerCase()
  const timing = describeNextReconciliation(ctx.workflow, ctx.now)

  if (ctx.presence === 'pulsarr_only') {
    const routed =
      ctx.instances.length > 0
        ? ` It is still in ${describeInstances(ctx.instances)}.`
        : ''
    return {
      state: 'removed_from_plex',
      reason: `No longer on the user's Plex watchlist; Pulsarr drops it at the next full reconciliation (${timing}).${routed}`,
    }
  }

  if (ctx.instances.length > 0) {
    return {
      state: 'routed',
      reason: `In ${describeInstances(ctx.instances)}`,
    }
  }

  if (!ctx.canSync) {
    return {
      state: 'sync_disabled',
      reason:
        "Sync is disabled for this user, so Pulsarr ignores their watchlist. Enable it on the user's settings",
    }
  }

  if (ctx.presence === 'plex_only') {
    if (ctx.exclusion) {
      return describeExclusion(ctx.exclusion)
    }
    return {
      state: 'not_seen_yet',
      reason: `On Plex, not seen by Pulsarr yet; ${timing}`,
    }
  }

  if (ctx.watchlistCapExceeded && ctx.status === 'pending') {
    return {
      state: 'watchlist_cap',
      reason: `The user is over their ${type} watchlist cap, so pending items are held back until they remove some`,
    }
  }

  if (ctx.exclusion) {
    return describeExclusion(ctx.exclusion)
  }

  if (type !== 'movie' && type !== 'show') {
    return {
      state: 'unsupported_type',
      reason: `Plex reports type "${ctx.type}", which Pulsarr does not route (only movies and shows)`,
    }
  }

  const missingIds = describeMissingIds(type, ctx.guids)
  if (missingIds) {
    return { state: 'missing_ids', reason: missingIds }
  }

  if (ctx.approval) {
    switch (ctx.approval.status) {
      case 'pending':
        return {
          state: 'awaiting_approval',
          reason: describePendingApproval(ctx.approval, type),
        }
      case 'rejected':
        return {
          state: 'approval_rejected',
          reason: ctx.approval.ruleName
            ? `The approval request was rejected (router rule "${ctx.approval.ruleName}"), so it will not be added`
            : 'The approval request was rejected, so it will not be added',
        }
      case 'expired':
        return {
          state: 'approval_expired',
          reason:
            'The approval request expired before anyone acted on it, so it was not added',
        }
      case 'approved':
      case 'auto_approved':
        return {
          state: 'approved_not_routed',
          reason:
            'Approved, but not on any Radarr/Sonarr instance yet. It is added on the next routing pass, or adding it failed (check the logs)',
        }
    }
  }

  return {
    state: 'not_routed',
    reason:
      'Stored by Pulsarr but not on any Radarr/Sonarr instance. No exclusion, approval or ID problem was found: a router rule may have skipped it, no rule matched with default routing off, or adding it failed (check the logs for this title)',
  }
}
