import { DELETE_REQUEST_NOTE } from '@/lib/approval'
import { formatCount, formatNumber, pluralize } from '@/lib/format'
import type { components } from '@/types/api.js'

type BulkResult = components['schemas']['ApprovalBulkResult']

export type BulkAction = 'approve' | 'deny' | 'delete'

export interface BulkFailure {
  message: string
  detail: string | null
}

const PAST_TENSE: Record<BulkAction, string> = {
  approve: 'approved',
  deny: 'denied',
  delete: 'deleted',
}

/** Null when every request went through. */
export function bulkFailure(
  action: BulkAction,
  result: BulkResult,
): BulkFailure | null {
  const failed = result.failed.length
  if (failed === 0) return null
  return {
    message: `${formatNumber(failed)} of ${formatCount(result.total, 'request')} ${pluralize(failed, 'was', 'were')} not ${PAST_TENSE[action]}.`,
    detail: result.errors[0] ?? null,
  }
}

export function bulkErrorFallback(action: BulkAction): string {
  return `The requests were not ${PAST_TENSE[action]}. Try again.`
}

export interface BulkConfirmCopy {
  title: string
  description: string
  confirmLabel: string
  pendingLabel: string
  variant: 'default' | 'destructive'
  noteLabel: string | null
}

export function bulkConfirmCopy(
  action: BulkAction,
  count: number,
  allDenied: boolean,
): BulkConfirmCopy {
  const requests = formatCount(count, 'request')
  switch (action) {
    case 'approve':
      return {
        title: `Approve ${requests}?`,
        description: allDenied
          ? 'They were denied. Approving sends each one where it was routed.'
          : 'Each one is sent where it was routed. To change routing, open the request instead.',
        confirmLabel: `Approve ${requests}`,
        pendingLabel: 'Approving...',
        variant: 'default',
        noteLabel: 'Notes',
      }
    case 'deny':
      return {
        title: `Deny ${requests}?`,
        description: 'Nothing is sent to Sonarr or Radarr.',
        confirmLabel: `Deny ${requests}`,
        pendingLabel: 'Denying...',
        variant: 'destructive',
        noteLabel: 'Reason',
      }
    case 'delete':
      return {
        title: `Delete ${requests}?`,
        description: DELETE_REQUEST_NOTE,
        confirmLabel: `Delete ${requests}`,
        pendingLabel: 'Deleting...',
        variant: 'destructive',
        noteLabel: null,
      }
  }
}
