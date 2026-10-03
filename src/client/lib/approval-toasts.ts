import type {
  ApprovalMetadata,
  ProgressMetadata,
} from '@root/types/progress.types.js'

export type ToastedApprovalAction =
  | 'created'
  | 'approved'
  | 'rejected'
  | 'deleted'

export interface ApprovalToast {
  title: string
  description: string
}

export function isApprovalMetadata(
  metadata: ProgressMetadata | undefined,
): metadata is ApprovalMetadata {
  return (
    metadata !== undefined && 'action' in metadata && 'contentTitle' in metadata
  )
}

export function isToastedApprovalAction(
  action: ApprovalMetadata['action'],
): action is ToastedApprovalAction {
  return action !== 'updated'
}

function singleToast(
  action: ToastedApprovalAction,
  { userName, contentTitle, contentType }: ApprovalMetadata,
): ApprovalToast {
  switch (action) {
    case 'created':
      return {
        title: 'New approval request',
        description: `${userName} requested ${contentTitle} (${contentType})`,
      }
    case 'approved':
      return {
        title: 'Request approved',
        description: `${contentTitle} has been approved for ${userName}`,
      }
    case 'rejected':
      return {
        title: 'Request rejected',
        description: `${userName}'s request for ${contentTitle} was rejected`,
      }
    case 'deleted':
      return {
        title: 'Request deleted',
        description: `Request for ${contentTitle} by ${userName} was deleted`,
      }
  }
}

function batchToast(
  action: ToastedApprovalAction,
  count: number,
): ApprovalToast {
  switch (action) {
    case 'created':
      return {
        title: 'New approval requests',
        description: `${count} new approval requests have been received`,
      }
    case 'approved':
      return {
        title: 'Requests approved',
        description: `${count} approval requests have been approved`,
      }
    case 'rejected':
      return {
        title: 'Requests rejected',
        description: `${count} approval requests have been rejected`,
      }
    case 'deleted':
      return {
        title: 'Requests deleted',
        description: `${count} approval requests have been deleted`,
      }
  }
}

/** One event names the request, several collapse into a count. */
export function approvalToast(
  action: ToastedApprovalAction,
  events: readonly [ApprovalMetadata, ...ApprovalMetadata[]],
): ApprovalToast {
  return events.length === 1
    ? singleToast(action, events[0])
    : batchToast(action, events.length)
}
