import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { User } from '@root/types/config.types.js'
import { buildPosterUrl } from '@root/utils/poster-url.js'
import type { DatabaseService } from '@services/database.service.js'
import { recipientLabel } from '@utils/recipient-label.js'
import type { FastifyBaseLogger } from 'fastify'
import { notifyAdmins } from '../dispatch.js'
import {
  APPROVAL_TRIGGER_LABELS,
  describeContent,
  displayName,
} from '../templates/labels.js'
import { createApprovalMessages } from '../templates/messages.js'
import {
  buildContentPayload,
  buildRoutingPayload,
  buildUserPayload,
} from '../templates/webhook-payloads.js'
import type { NotificationDeps } from '../types.js'

async function fetchPosterUrls(
  db: DatabaseService,
  logger: FastifyBaseLogger,
  queuedRequests: ApprovalRequest[],
): Promise<Map<string, string>> {
  const posterMap = new Map<string, string>()
  const contentKeys = queuedRequests.map((r) => r.contentKey)

  try {
    const watchlistItems = await db.getWatchlistItemsByKeys(contentKeys)
    for (const item of watchlistItems) {
      if (item.thumb) {
        const posterUrl = buildPosterUrl(item.thumb, 'notification')
        if (posterUrl) {
          posterMap.set(item.key, posterUrl)
        }
      }
    }
  } catch (error) {
    logger.debug(
      { error },
      'Could not batch fetch posters for approval notifications',
    )
  }

  return posterMap
}

async function requesters(
  db: DatabaseService,
  requests: ApprovalRequest[],
): Promise<Map<number, User>> {
  const users = await db.getUsersByIds([
    ...new Set(requests.map((r) => r.userId)),
  ])
  return new Map(users.map((user) => [user.id, user]))
}

export function approvalRequester(
  request: ApprovalRequest,
  user: User | undefined | null,
) {
  return buildUserPayload({
    id: request.userId,
    name: request.userName,
    alias: user?.alias,
  })
}

export function approvalContent(request: ApprovalRequest) {
  return buildContentPayload({
    title: request.contentTitle,
    type: request.contentType,
    key: request.contentKey,
    guids: request.contentGuids,
    thumb: request.thumb,
  })
}

/** Delivery line summary for any approval event, `context` is the trigger, resolution or reason. */
export function requestSummary(
  request: ApprovalRequest,
  requester: User | undefined | null,
  context: string,
): string {
  const by = requester
    ? recipientLabel(requester)
    : displayName({ name: request.userName }, request.userId)
  return `${describeContent(request.contentTitle, request.contentType)} for ${by}, ${context}`
}

/** One DM covers the batch. Each request gets its own webhook, Apprise message and `approval.created` event. */
export async function sendApprovalBatch(
  deps: NotificationDeps,
  queuedRequests: ApprovalRequest[],
  totalPending: number,
): Promise<boolean> {
  if (queuedRequests.length === 0) return false

  const setting = deps.config.approvalNotify
  const [posterMap, users] = await Promise.all([
    fetchPosterUrls(deps.db, deps.logger, queuedRequests),
    requesters(deps.db, queuedRequests),
  ])
  const messages = createApprovalMessages(
    queuedRequests,
    totalPending,
    posterMap,
    users,
  )
  const summaries = queuedRequests.map((request) =>
    requestSummary(
      request,
      users.get(request.userId),
      APPROVAL_TRIGGER_LABELS[request.triggeredBy].toLowerCase(),
    ),
  )

  const batchSummary =
    queuedRequests.length === 1
      ? summaries[0]
      : `${queuedRequests.length} requests, ${totalPending} pending`
  const dmSent = await notifyAdmins(deps, {
    setting,
    line: { event: 'approvalRequest', summary: batchSummary },
    message: { dm: messages.dm },
  })

  let anySent = dmSent
  for (const [index, request] of queuedRequests.entries()) {
    const { proposedRouting, additionalRouting } =
      request.proposedRouterDecision.approval ?? {}
    const sent = await notifyAdmins(deps, {
      setting,
      line: {
        event: 'approvalRequest',
        summary: summaries[index],
        userId: request.userId,
      },
      message: messages.requests[index],
      webhook: {
        event: 'approval.created',
        payload: {
          approvalId: request.id,
          content: {
            ...approvalContent(request),
            posterUrl: posterMap.get(request.contentKey),
          },
          requestedBy: approvalRequester(request, users.get(request.userId)),
          triggeredBy: request.triggeredBy,
          approvalReason: request.approvalReason ?? null,
          pendingCount: totalPending,
          proposedRouting: proposedRouting
            ? buildRoutingPayload(proposedRouting)
            : undefined,
          additionalRouting: additionalRouting?.map(buildRoutingPayload),
        },
      },
    })
    anySent = anySent || sent
  }

  return anySent
}
