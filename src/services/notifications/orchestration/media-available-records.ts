import type { User } from '@root/types/config.types.js'
import type { NotificationResult } from '@root/types/notification.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { WatchlistItemUpdate } from '@root/types/watchlist-status.types.js'
import { NOTHING_DELIVERED } from '../dispatch.js'
import type { DeliveryOutcome, NotificationDeps } from '../types.js'
import {
  type EnrichmentData,
  getPublicContentNotificationFlags,
  type MediaAvailableOptions,
  type MediaInfo,
  type NotificationTypeInfo,
  PUBLIC_USER_ID,
} from './media-available-enrichment.js'

/** A notification row inserted before delivery. The row is the dedupe key until `releaseClaim` drops a claim that notified nobody. */
export interface ClaimedNotification extends NotificationResult {
  recordId: number
  watchlistItemKey: string
}

function instanceUpdateFor(
  options: MediaAvailableOptions,
): Pick<WatchlistItemUpdate, 'radarr_instance_id' | 'sonarr_instance_id'> {
  if (!options.instanceId) return {}
  if (options.instanceType === 'radarr') {
    return { radarr_instance_id: options.instanceId }
  }
  if (options.instanceType === 'sonarr') {
    return { sonarr_instance_id: options.instanceId }
  }
  return {}
}

function episodeColumns(
  mediaInfo: MediaInfo,
  typeInfo: NotificationTypeInfo,
): { message?: string; season_number?: number; episode_number?: number } {
  const episode =
    typeInfo.contentType === 'episode' ? mediaInfo.episodes?.[0] : undefined
  if (episode) {
    return {
      message: episode.overview,
      season_number: episode.seasonNumber,
      episode_number: episode.episodeNumber,
    }
  }
  return typeInfo.contentType === 'season'
    ? { season_number: typeInfo.seasonNumber }
    : {}
}

function notificationFor(
  mediaInfo: MediaInfo,
  title: string,
  username: string,
  enrichment: EnrichmentData,
): NotificationResult['notification'] {
  return {
    type: mediaInfo.type,
    title,
    username,
    posterUrl: enrichment.posterUrl,
    tmdbUrl: enrichment.tmdbUrl,
    episodeDetails: enrichment.episodeDetails,
  }
}

export async function recordAvailability(
  deps: NotificationDeps,
  mediaInfo: MediaInfo,
  options: MediaAvailableOptions,
  watchlistItems: TokenWatchlistItem[],
): Promise<void> {
  const instanceUpdate = instanceUpdateFor(options)

  for (const item of watchlistItems) {
    const userId = Number(item.user_id)
    if (Number.isNaN(userId) || !item.key) continue

    try {
      await deps.db.updateWatchlistItem(userId, item.key, {
        status: 'grabbed',
        ...instanceUpdate,
      })
    } catch (error) {
      deps.logger.error(
        { error, userId, key: item.key, title: mediaInfo.title },
        'Failed to record availability for watchlist item',
      )
    }
  }
}

/** Marks each item notified and inserts its row in one transaction, skipping duplicates and users with nothing to receive. */
export async function claimUserNotifications(
  deps: NotificationDeps,
  mediaInfo: MediaInfo,
  options: MediaAvailableOptions,
  watchlistItems: TokenWatchlistItem[],
  users: Map<number, User>,
  enrichment: EnrichmentData,
  typeInfo: NotificationTypeInfo,
): Promise<ClaimedNotification[]> {
  const claims: ClaimedNotification[] = []
  const { contentType, seasonNumber } = typeInfo

  // public mention IDs are derived from these results, so mention-only users must stay in
  const { hasDiscordUrls } = getPublicContentNotificationFlags(
    deps.config.publicContentNotifications,
  )
  const publicMentionsPossible =
    Boolean(deps.config.publicContentNotifications?.enabled) && hasDiscordUrls

  const instanceUpdate = instanceUpdateFor(options)

  for (const item of watchlistItems) {
    const user = users.get(item.user_id)
    if (!user) continue

    const mentionEligible =
      publicMentionsPossible &&
      user.notify_discord_mention &&
      Boolean(user.discord_id?.trim())

    if (
      !user.notify_discord &&
      !user.notify_apprise &&
      !user.notify_plex_mobile &&
      !mentionEligible
    )
      continue

    const title = mediaInfo.title || item.title
    const userId = Number(item.user_id)
    const itemId =
      typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id

    if (Number.isNaN(userId) || Number.isNaN(itemId)) {
      deps.logger.warn(
        { rawUserId: item.user_id, rawItemId: item.id },
        'Skipping notification, invalid userId or itemId',
      )
      continue
    }

    const isDuplicate = await deps.db.hasActiveNotification({
      userId,
      watchlistItemId: itemId,
      type: contentType,
      seasonNumber,
      ...(contentType === 'episode' &&
        mediaInfo.episodes?.[0] && {
          episodeNumber: mediaInfo.episodes[0].episodeNumber,
        }),
    })
    if (isDuplicate) continue

    let recordId: number | null
    try {
      recordId = await deps.db.transaction(async (trx) => {
        await deps.db.updateWatchlistItem(
          item.user_id,
          item.key,
          {
            status: 'notified',
            last_notified_at: new Date().toISOString(),
            ...instanceUpdate,
          },
          trx,
        )
        return deps.db.createNotificationRecord(
          {
            watchlist_item_id: itemId,
            user_id: userId,
            type: contentType,
            title,
            ...episodeColumns(mediaInfo, typeInfo),
            ...NOTHING_DELIVERED,
          },
          trx,
        )
      })
    } catch (error) {
      deps.logger.error(
        { error, userId, itemId, title: mediaInfo.title },
        'Failed to create notification record for user, skipping',
      )
      continue
    }

    if (recordId !== null) {
      claims.push({
        user,
        notification: notificationFor(mediaInfo, title, user.name, enrichment),
        recordId,
        watchlistItemKey: item.key,
      })
    }
  }

  return claims
}

/** Public channels dedupe on title, so one row covers every watchlister. */
export async function claimPublicNotification(
  deps: NotificationDeps,
  mediaInfo: MediaInfo,
  watchlistItems: TokenWatchlistItem[],
  enrichment: EnrichmentData,
  typeInfo: NotificationTypeInfo,
): Promise<ClaimedNotification | null> {
  if (!deps.config.publicContentNotifications?.enabled) return null
  const [referenceItem] = watchlistItems
  if (!referenceItem) return null

  const { contentType, seasonNumber, episodeNumber } = typeInfo
  const title = mediaInfo.title || referenceItem.title || 'Unknown Title'

  const isDuplicate = await deps.db.hasActiveNotification({
    userId: null,
    watchlistItemId: null,
    type: contentType,
    title,
    seasonNumber,
    episodeNumber,
  })
  if (isDuplicate) {
    deps.logger.debug(
      { title, contentType, seasonNumber, episodeNumber },
      'Skipping public notification, already sent',
    )
    return null
  }

  let recordId: number | null
  try {
    recordId = await deps.db.createNotificationRecord({
      watchlist_item_id: null,
      user_id: null,
      type: contentType,
      title,
      ...episodeColumns(mediaInfo, typeInfo),
      ...NOTHING_DELIVERED,
    })
  } catch (error) {
    deps.logger.error(
      { error, title, type: contentType },
      'Failed to create public notification record',
    )
    return null
  }
  if (recordId === null) return null

  const { hasDiscordUrls, hasAppriseUrls } = getPublicContentNotificationFlags(
    deps.config.publicContentNotifications,
  )
  return {
    user: {
      id: PUBLIC_USER_ID,
      name: 'Public Content',
      apprise: null,
      alias: null,
      discord_id: null,
      notify_apprise: hasAppriseUrls,
      notify_discord: hasDiscordUrls,
      notify_discord_mention: false,
      notify_plex_mobile: false,
      can_sync: false,
    },
    notification: notificationFor(
      mediaInfo,
      title,
      'Public Content',
      enrichment,
    ),
    recordId,
    watchlistItemKey: referenceItem.key,
  }
}

export async function updateDelivery(
  deps: Pick<NotificationDeps, 'db' | 'logger'>,
  recordId: number,
  delivery: Required<DeliveryOutcome>,
): Promise<void> {
  try {
    await deps.db.updateNotificationDelivery(recordId, delivery)
  } catch (error) {
    deps.logger.error(
      { error, recordId },
      'Failed to record notification delivery',
    )
  }
}

/** Never rejects. Deletes the claim row so the next event for this content notifies again. */
export async function releaseClaim(
  deps: Pick<NotificationDeps, 'db' | 'logger'>,
  recordId: number,
): Promise<void> {
  try {
    await deps.db.deleteNotificationRecord(recordId)
  } catch (error) {
    deps.logger.error(
      { error, recordId },
      'Failed to release undelivered notification claim',
    )
  }
}
