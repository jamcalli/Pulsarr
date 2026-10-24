import { emitWatchlistChange } from '@root/utils/watchlist-events.js'
import { buildUserPayload } from '../templates/webhook-payloads.js'
import type { NotificationDeps } from '../types.js'
import {
  buildEnrichment,
  determineNotificationType,
  type MediaAvailableOptions,
  type MediaInfo,
} from './media-available-enrichment.js'
import { deliverMediaAvailable } from './media-available-fan-out.js'
import {
  claimPublicNotification,
  claimUserNotifications,
  recordAvailability,
} from './media-available-records.js'

/** Matching and record claims are awaited, deliveries run detached. `matchedCount` is the number of matching watchlist items. */
export async function sendMediaAvailable(
  deps: NotificationDeps,
  mediaInfo: MediaInfo,
  options: MediaAvailableOptions,
): Promise<{ matchedCount: number }> {
  const watchlistItems = await deps.db.getWatchlistItemsByGuid(mediaInfo.guid)
  const typeInfo = determineNotificationType(mediaInfo, options.isBulkRelease)
  if (!typeInfo || watchlistItems.length === 0) return { matchedCount: 0 }

  const recordedUserIds = await recordAvailability(
    deps,
    mediaInfo,
    options,
    watchlistItems,
  )

  const userIds = [...new Set(watchlistItems.map((item) => item.user_id))]
  const users = new Map(
    (await deps.db.getUsersByIds(userIds)).map((user) => [user.id, user]),
  )
  const enrichment = buildEnrichment(mediaInfo, typeInfo, watchlistItems)

  const userClaims = deps.config.notifyOnAvailability
    ? await claimUserNotifications(
        deps,
        mediaInfo,
        options,
        watchlistItems,
        users,
        enrichment,
        typeInfo,
      )
    : []
  emitWatchlistChange(deps.progress, 'status', [
    ...recordedUserIds,
    ...userClaims.map((claim) => claim.user.id),
  ])

  const publicClaim = await claimPublicNotification(
    deps,
    mediaInfo,
    watchlistItems,
    enrichment,
    typeInfo,
  )

  deps.detach(
    deliverMediaAvailable(deps, {
      mediaInfo,
      options,
      enrichment,
      claims: publicClaim ? [...userClaims, publicClaim] : userClaims,
      watchlisters: userIds.flatMap((id) => {
        const user = users.get(id)
        return user ? [buildUserPayload(user)] : []
      }),
    }),
  )

  return { matchedCount: watchlistItems.length }
}
