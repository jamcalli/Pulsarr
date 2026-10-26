import type {
  ApprovalRequest,
  RouterDecision,
} from '@root/types/approval.types.js'
import type { User } from '@root/types/config.types.js'
import type { Item as WatchlistItem } from '@root/types/plex.types.js'
import { toContentType } from '@utils/content-type.js'
import { parseGuids } from '@utils/guid-handler.js'
import { recipientLabel } from '@utils/recipient-label.js'
import { dispatchAndRecord } from '../dispatch.js'
import { describeContent } from '../templates/labels.js'
import {
  buildContentPayload,
  buildRoutingPayload,
  buildUserPayload,
} from '../templates/webhook-payloads.js'
import type { NotificationDeps } from '../types.js'
import {
  approvalContent,
  approvalRequester,
  requestSummary,
} from './approval.js'

/** Routing goes out only with an approval. A denial is sent as `rejected`. */
export async function sendApprovalResolved(
  deps: NotificationDeps,
  request: ApprovalRequest,
  resolution: 'approved' | 'denied',
  resolvedBy: number | null,
  notes?: string,
): Promise<boolean> {
  const approval =
    resolution === 'approved'
      ? request.proposedRouterDecision.approval
      : undefined
  const proposedRouting = approval?.proposedRouting
  const requester = await deps.db.getUser(request.userId)

  return dispatchAndRecord(
    deps,
    {
      event: 'approvalResolved',
      summary: requestSummary(request, requester, resolution),
      userId: request.userId,
    },
    {
      event: 'approval.resolved',
      payload: {
        approvalId: request.id,
        status: resolution === 'denied' ? 'rejected' : 'approved',
        content: approvalContent(request),
        requestedBy: approvalRequester(request, requester),
        resolvedBy: {
          userId: resolvedBy,
        },
        approvalNotes: notes,
        triggeredBy: request.triggeredBy,
        createdAt: request.createdAt,
        resolvedAt: request.updatedAt,
        routing: proposedRouting
          ? buildRoutingPayload(proposedRouting)
          : undefined,
        additionalRouting:
          approval?.additionalRouting?.map(buildRoutingPayload),
      },
    },
    {
      watchlist_item_id: null,
      user_id: request.userId,
      type: 'approval_resolved',
      title: request.contentTitle,
      message: `Approval ${resolution}: ${request.contentTitle}`,
    },
  )
}

export async function sendApprovalAuto(
  deps: NotificationDeps,
  request: ApprovalRequest,
  routing: NonNullable<RouterDecision['routing']>,
  reason: string,
): Promise<boolean> {
  const requester = await deps.db.getUser(request.userId)
  return dispatchAndRecord(
    deps,
    {
      event: 'approvalAuto',
      summary: requestSummary(request, requester, reason),
      userId: request.userId,
    },
    {
      event: 'approval.auto',
      payload: {
        approvalId: request.id,
        content: approvalContent(request),
        user: approvalRequester(request, requester),
        routing: buildRoutingPayload(routing),
        additionalRouting:
          request.proposedRouterDecision.approval?.additionalRouting?.map(
            buildRoutingPayload,
          ),
        reason,
      },
    },
    {
      watchlist_item_id: null,
      user_id: request.userId,
      type: 'approval_auto',
      title: request.contentTitle,
      message: `Auto-approved: ${request.contentTitle}`,
    },
  )
}

export async function sendWatchlistRemoved(
  deps: NotificationDeps,
  userId: number,
  username: string,
  item: WatchlistItem & { id: number },
): Promise<boolean> {
  const guids =
    typeof item.guids === 'string' ? parseGuids(item.guids) : (item.guids ?? [])
  const contentType = toContentType(item.type)
  const user = await deps.db.getUser(userId)

  return dispatchAndRecord(
    deps,
    {
      event: 'watchlistRemoved',
      summary: `${describeContent(item.title, contentType)}, removed by ${user ? recipientLabel(user) : username}`,
      userId,
    },
    {
      event: 'watchlist.removed',
      payload: {
        watchlistItemId: item.id,
        content: buildContentPayload({
          title: item.title,
          type: contentType,
          key: item.key,
          guids,
          thumb: item.thumb,
        }),
        removedBy: buildUserPayload({
          id: userId,
          name: username,
          alias: user?.alias,
        }),
      },
    },
    {
      watchlist_item_id: item.id,
      user_id: userId,
      type: 'watchlist_removed',
      title: item.title,
      message: `Removed from watchlist: ${item.title}`,
    },
  )
}

export function sendUserCreated(
  deps: NotificationDeps,
  user: User,
): Promise<boolean> {
  return dispatchAndRecord(
    deps,
    { event: 'userCreated', summary: user.name, userId: user.id },
    {
      event: 'user.created',
      payload: {
        user: {
          id: user.id,
          name: user.name,
          alias: user.alias ?? null,
        },
        canSync: user.can_sync,
        requiresApproval: user.requires_approval,
        createdAt: user.created_at ?? new Date().toISOString(),
      },
    },
    {
      watchlist_item_id: null,
      user_id: user.id,
      type: 'user_created',
      title: user.name,
      message: `New user created: ${user.name}`,
    },
  )
}
