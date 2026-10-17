import type { User } from '@root/types/config.types.js'
import type { WatchlistCapNotification } from '@root/types/notification.types.js'
import {
  deliverToAdmins,
  NOTHING_DELIVERED,
  recipientLabel,
  recordDelivery,
  sendToUser,
} from '../dispatch.js'
import type { NotificationState } from '../state.js'
import {
  mediaTypeLabel,
  userLabel,
  WATCHLIST_CAP_TITLE,
} from '../templates/labels.js'
import {
  createUserWatchlistCapMessage,
  createWatchlistCapMessage,
} from '../templates/messages.js'
import { buildUserPayload } from '../templates/webhook-payloads.js'
import type { DeliveryOutcome, NotificationDeps } from '../types.js'

const DEBOUNCE_MS = 60_000

function usage(event: WatchlistCapNotification): string {
  const noun = `${mediaTypeLabel(event.contentType).label.toLowerCase()}s`
  return `${event.currentCount} of ${event.cap} ${noun}`
}

async function notifyCappedUser(
  deps: NotificationDeps,
  event: WatchlistCapNotification,
  user: User,
): Promise<DeliveryOutcome> {
  const message = createUserWatchlistCapMessage(
    event,
    userLabel(user.alias || user.name, event.userId),
  )
  const sent = await sendToUser(
    deps,
    user,
    {
      event: 'watchlistCap',
      summary: `${recipientLabel(user)}, ${usage(event)}`,
    },
    message,
  )
  return { ...sent, sent_to_native_webhook: false }
}

async function dispatchNotification(
  deps: NotificationDeps,
  event: WatchlistCapNotification,
): Promise<boolean> {
  const key = `${event.userId}:${event.contentType}`
  const counts = deps.state.watchlistCapCounts

  const lastCount = counts.get(key)
  if (lastCount !== undefined && event.currentCount <= lastCount) {
    deps.logger.debug(
      { userId: event.userId, contentType: event.contentType },
      'Watchlist cap notification suppressed (count unchanged since last notification)',
    )
    return false
  }

  counts.set(key, event.currentCount)
  let sent = false
  try {
    sent = await deliverCapNotification(deps, event)
    return sent
  } finally {
    if (!sent && counts.get(key) === event.currentCount) {
      if (lastCount === undefined) counts.delete(key)
      else counts.set(key, lastCount)
    }
  }
}

async function deliverCapNotification(
  deps: NotificationDeps,
  event: WatchlistCapNotification,
): Promise<boolean> {
  const contentLabel = mediaTypeLabel(event.contentType).label
  const user = await deps.db.getUser(event.userId)
  const who = user
    ? recipientLabel(user)
    : userLabel(event.userName, event.userId)

  const [admin, capped] = await Promise.all([
    deliverToAdmins(deps, {
      setting: deps.config.watchlistCapNotify,
      line: {
        event: 'watchlistCap',
        summary: `${who}, ${usage(event)}`,
        userId: event.userId,
      },
      message: createWatchlistCapMessage(event),
      webhook: {
        event: 'quota.cap_reached',
        payload: {
          user: buildUserPayload({
            id: event.userId,
            name: event.userName,
            alias: user?.alias,
          }),
          contentType: event.contentType,
          currentCount: event.currentCount,
          cap: event.cap,
        },
      },
    }),
    deps.config.watchlistCapNotifyUser && user
      ? notifyCappedUser(deps, event, user)
      : NOTHING_DELIVERED,
  ])
  return recordDelivery(
    deps,
    {
      watchlist_item_id: null,
      user_id: event.userId,
      type: 'watchlist_cap',
      title: `${contentLabel} ${WATCHLIST_CAP_TITLE}`,
      message: `${userLabel(event.userName, event.userId)} reached their ${contentLabel.toLowerCase()} cap (${event.currentCount}/${event.cap})`,
    },
    {
      sent_to_discord: admin.sent_to_discord || capped.sent_to_discord,
      sent_to_apprise: admin.sent_to_apprise || capped.sent_to_apprise,
      sent_to_native_webhook: admin.sent_to_native_webhook,
    },
  )
}

// Each call resets the timer so a burst fires one notification with the latest count
export function sendWatchlistCapReached(
  deps: NotificationDeps,
  event: WatchlistCapNotification,
): void {
  const key = `${event.userId}:${event.contentType}`
  const timers = deps.state.watchlistCapTimers

  const existing = timers.get(key)
  clearTimeout(existing)

  const timer = setTimeout(() => {
    timers.delete(key)
    deps.detach(dispatchNotification(deps, event))
  }, DEBOUNCE_MS)

  timers.set(key, timer)

  deps.logger.debug(
    {
      userId: event.userId,
      contentType: event.contentType,
      count: event.currentCount,
      cap: event.cap,
    },
    existing
      ? 'Watchlist cap notification debounce reset (new event received)'
      : 'Watchlist cap notification queued (will fire after quiet period)',
  )
}

/** Forgets the last notified count and drops a pending notification, so the next time over the cap notifies again. */
export function clearWatchlistCap(
  state: NotificationState,
  userId: number,
  contentType: WatchlistCapNotification['contentType'],
): void {
  const key = `${userId}:${contentType}`
  clearTimeout(state.watchlistCapTimers.get(key))
  state.watchlistCapTimers.delete(key)
  state.watchlistCapCounts.delete(key)
}
