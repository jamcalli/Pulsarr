/**
 * Resolves a user's effective delivery schedule (their overrides on top of
 * the admin defaults) and decides when a notification should be delivered.
 */

import {
  DEFAULT_NOTIFICATION_DELIVERY,
  type DigestMode,
  isValidTimeZone,
  type NotificationDeliveryDefaults,
  type UserDeliverySchedule,
} from '@root/schemas/notifications/delivery-schedule.schema.js'
import {
  getNextTimeOfDay,
  getQuietHoursEnd,
  getServerTimeZone,
} from './time-math.js'

export interface EffectiveDeliverySchedule {
  digestMode: DigestMode
  digestWindowMinutes: number
  digestTime: string
  quietHours: { start: string; end: string } | null
  timeZone: string
}

export type HoldReason = 'digest' | 'quiet_hours'

export interface DeliveryDecision {
  deliverAfter: number
  reason: HoldReason
}

/**
 * Applies a user's overrides on top of the admin defaults. Each override is
 * independent: a null field inherits the matching default.
 */
export function resolveDeliverySchedule(
  user: UserDeliverySchedule,
  defaults: Partial<NotificationDeliveryDefaults> | undefined,
  serverTimeZone: string = getServerTimeZone(),
): EffectiveDeliverySchedule {
  const base = { ...DEFAULT_NOTIFICATION_DELIVERY, ...defaults }

  const quietEnabled = user.notify_quiet_hours_enabled ?? base.quietHoursEnabled

  const timeZone = [user.notify_timezone, base.timezone, serverTimeZone].find(
    (zone): zone is string => Boolean(zone) && isValidTimeZone(zone as string),
  )

  return {
    digestMode: user.notify_digest_mode ?? base.digestMode,
    digestWindowMinutes:
      user.notify_digest_window_minutes ?? base.digestWindowMinutes,
    digestTime: user.notify_digest_time ?? base.digestTime,
    quietHours: quietEnabled
      ? {
          start: user.notify_quiet_hours_start ?? base.quietHoursStart,
          end: user.notify_quiet_hours_end ?? base.quietHoursEnd,
        }
      : null,
    timeZone: timeZone ?? 'UTC',
  }
}

/**
 * When a notification arriving at `now` should go out, or null to deliver it
 * immediately (the behaviour with both features off).
 *
 * The digest window is fixed from the first held item: the flusher delivers
 * every held row for a user once any of them is due, so later arrivals ride
 * along with the earliest batch. A delivery time that lands in quiet hours is
 * pushed to the end of those quiet hours.
 */
export function computeDeliveryDecision(
  now: number,
  schedule: EffectiveDeliverySchedule,
): DeliveryDecision | null {
  let deliverAfter = now
  let reason: HoldReason | null = null

  if (schedule.digestMode === 'window') {
    deliverAfter = now + schedule.digestWindowMinutes * 60_000
    reason = 'digest'
  } else if (schedule.digestMode === 'daily') {
    const next = getNextTimeOfDay(now, schedule.digestTime, schedule.timeZone)
    if (next !== null) {
      deliverAfter = next
      reason = 'digest'
    }
  }

  if (schedule.quietHours) {
    const quietEnd = getQuietHoursEnd(deliverAfter, {
      ...schedule.quietHours,
      timeZone: schedule.timeZone,
    })
    if (quietEnd !== null) {
      deliverAfter = quietEnd
      reason = 'quiet_hours'
    }
  }

  return reason ? { deliverAfter, reason } : null
}
