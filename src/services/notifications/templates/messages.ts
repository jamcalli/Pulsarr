import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { User } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { DirectMessage } from '@root/types/discord.types.js'
import type {
  MediaNotification,
  NotificationMessage,
  UpdateAvailableRelease,
  WatchlistCapNotification,
} from '@root/types/notification.types.js'
import { getTmdbUrl } from '@root/utils/guid-handler.js'
import {
  createApprovalAppriseMessage,
  createDeleteSyncAppriseMessage,
  createMediaAppriseMessage,
  createUpdateAvailableAppriseMessage,
  createWatchlistAddedAppriseMessage,
  createWatchlistCapAppriseMessage,
} from './apprise-html.js'
import {
  createApprovalBatchDm,
  createApprovalRequestEmbed,
  createDeleteSyncEmbed,
  createMediaAddedEmbed,
  createMediaNotificationEmbed,
  createPublicMediaWebhookPayload,
  createSystemDm,
  createUpdateAvailableEmbed,
  createUserWatchlistCapDm,
  createWatchlistCapDm,
  createWatchlistCapEmbed,
  createWebhookPayload,
} from './discord-embeds.js'
import { displayName } from './labels.js'

type RequestMessage = Omit<NotificationMessage, 'dm'>

export interface ApprovalMessages {
  dm: DirectMessage
  requests: RequestMessage[]
}

/** Expects at least one request. One DM covers the batch and each request gets its own webhook and Apprise message. */
export function createApprovalMessages(
  requests: ApprovalRequest[],
  totalPending: number,
  posterUrls: Map<string, string>,
  users: Map<number, User>,
): ApprovalMessages {
  const requesterName = (request: ApprovalRequest) =>
    displayName(
      users.get(request.userId) ?? { name: request.userName },
      request.userId,
    )
  return {
    dm: createApprovalBatchDm(requests, totalPending, requesterName),
    requests: requests.map((request) => {
      const posterUrl = posterUrls.get(request.contentKey)
      const requestedBy = requesterName(request)
      return {
        webhook: createWebhookPayload(
          'approval',
          createApprovalRequestEmbed(
            request,
            totalPending,
            posterUrl,
            requestedBy,
          ),
        ),
        apprise: createApprovalAppriseMessage({
          contentTitle: request.contentTitle,
          contentType: request.contentType,
          requestedBy,
          trigger: request.triggeredBy,
          reason: request.approvalReason,
          totalPending,
          posterUrl,
          tmdbUrl: getTmdbUrl(request.contentGuids, request.contentType),
        }),
      }
    }),
  }
}

/** The webhook form goes to public channels and mentions `mentionDiscordIds`. */
export function createMediaAvailableMessage(
  notification: MediaNotification,
  mentionDiscordIds: string[],
): NotificationMessage {
  return {
    webhook: createPublicMediaWebhookPayload(notification, mentionDiscordIds),
    dm: { embed: createMediaNotificationEmbed(notification) },
    apprise: createMediaAppriseMessage(notification),
  }
}

export function createDeleteSyncMessage(
  results: DeleteSyncResult,
  dryRun: boolean,
): NotificationMessage {
  const embed = createDeleteSyncEmbed(results, dryRun)
  return {
    webhook: createWebhookPayload('deleteSync', embed),
    dm: createSystemDm({
      title: embed.title || 'Delete sync results',
      fields: embed.fields || [],
      safetyTriggered: results.safetyTriggered,
    }),
    apprise: createDeleteSyncAppriseMessage(results, dryRun),
  }
}

export function createUpdateAvailableMessage(
  release: UpdateAvailableRelease,
): NotificationMessage {
  const embed = createUpdateAvailableEmbed(release)
  return {
    webhook: {
      ...createWebhookPayload('updateAvailable', embed),
      // Release notes can contain @everyone or @here
      allowed_mentions: { parse: [] },
    },
    dm: { embed },
    apprise: createUpdateAvailableAppriseMessage(release),
  }
}

export function createWatchlistAddedMessage(
  notification: MediaNotification,
  addedBy: string,
): NotificationMessage {
  const embed = createMediaAddedEmbed(notification, addedBy)
  return {
    webhook: createWebhookPayload('default', embed),
    dm: { embed },
    apprise: createWatchlistAddedAppriseMessage(notification, addedBy),
  }
}

export function createWatchlistCapMessage(
  event: WatchlistCapNotification,
  who: string,
): NotificationMessage {
  return {
    webhook: createWebhookPayload(
      'watchlistCap',
      createWatchlistCapEmbed(event, who),
    ),
    dm: createWatchlistCapDm(event, who),
    apprise: createWatchlistCapAppriseMessage(event, who),
  }
}

export function createUserWatchlistCapMessage(
  event: WatchlistCapNotification,
  displayName: string,
): Omit<NotificationMessage, 'webhook'> {
  return {
    dm: createUserWatchlistCapDm(event, displayName),
    apprise: createWatchlistCapAppriseMessage(event, displayName),
  }
}
