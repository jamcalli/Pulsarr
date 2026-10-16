import type { Friend } from '@root/types/plex.types.js'
import type { RoutingDetails } from '@root/types/router.types.js'
import { getTmdbUrl } from '@root/utils/guid-handler.js'
import { getUserCanSync } from '@services/plex-watchlist/users/permissions.js'
import { toContentType } from '@utils/content-type.js'
import { toItemId } from '@utils/item-id.js'
import { notifyAdmins, recipientLabel } from '../dispatch.js'
import { describeContent } from '../templates/labels.js'
import { createWatchlistAddedMessage } from '../templates/messages.js'
import {
  buildContentPayload,
  buildRoutedToItem,
  buildUserPayload,
} from '../templates/webhook-payloads.js'
import type { NotificationDeps } from '../types.js'

export interface WatchlistItemInfo {
  id?: number | string
  title: string
  type: string
  thumb?: string
  key?: string
  guids?: string | string[]
}

/** Skips users who cannot sync. Resolves true when any channel, native webhooks included, delivered. */
export async function sendWatchlistAdded(
  deps: NotificationDeps,
  user: Friend & { userId: number },
  item: WatchlistItemInfo,
  routingDetails?: RoutingDetails[],
): Promise<boolean> {
  const { db, logger } = deps

  const canSync = await getUserCanSync(user.userId, { db, logger })
  if (!canSync) {
    logger.debug(
      { userId: user.userId },
      `Skipping watchlist add notification for ${user.username}, sync disabled`,
    )
    return false
  }

  const username = user.username || 'Unknown User'
  const alias = (await db.getUser(user.userId))?.alias
  const mediaType = toContentType(item.type)
  const guids = Array.isArray(item.guids)
    ? item.guids
    : item.guids
      ? [item.guids]
      : []
  const { posterUrl, ...content } = buildContentPayload({
    title: item.title,
    type: mediaType,
    key: item.key ?? '',
    guids,
    thumb: item.thumb,
  })
  const itemId = toItemId(item.id)

  return notifyAdmins(deps, {
    setting: deps.config.watchlistAddNotify,
    line: {
      event: 'watchlistAdded',
      summary: `${describeContent(item.title, mediaType)}, added by ${recipientLabel({ name: username, alias })}`,
      userId: user.userId,
    },
    message: createWatchlistAddedMessage(
      {
        username,
        title: item.title,
        type: mediaType,
        posterUrl,
        tmdbUrl: getTmdbUrl(item.guids, mediaType),
      },
      alias || username,
    ),
    webhook: {
      event: 'watchlist.added',
      payload: {
        addedBy: buildUserPayload({ id: user.userId, name: username, alias }),
        content: { ...content, thumb: posterUrl },
        routedTo:
          routingDetails?.map((detail) => buildRoutedToItem(detail)) ?? [],
      },
    },
    record: {
      watchlist_item_id:
        itemId !== undefined && !Number.isNaN(itemId) ? itemId : null,
      user_id: user.userId,
      type: 'watchlist_add',
      title: item.title,
      message: `New ${item.type} added to watchlist`,
    },
  })
}
