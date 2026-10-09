import { z } from 'zod'

/**
 * Quiet hours + digest batching for media-available user notifications.
 *
 * Admins set defaults in `notificationDelivery`; each user inherits them
 * unless one of their `notify_*` schedule columns is set (NULL = inherit).
 */

export const DIGEST_WINDOW_MAX_MINUTES = 24 * 60

export function isValidTimeZone(value: string): boolean {
  if (!value) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const DigestModeSchema = z.enum(['off', 'window', 'daily']).meta({
  description:
    'off = deliver immediately, window = coalesce for N minutes, daily = one digest at a fixed time',
})

export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  error: 'Time must be HH:MM (24-hour)',
})

export const DigestWindowMinutesSchema = z
  .number()
  .int()
  .min(1, { error: 'Digest window must be at least 1 minute' })
  .max(DIGEST_WINDOW_MAX_MINUTES, {
    error: `Digest window cannot exceed ${DIGEST_WINDOW_MAX_MINUTES} minutes`,
  })

export const TimeZoneSchema = z
  .string()
  .refine(isValidTimeZone, { error: 'Unknown IANA time zone' })

export const NotificationDeliveryDefaultsSchema = z
  .object({
    digestMode: DigestModeSchema,
    digestWindowMinutes: DigestWindowMinutesSchema,
    digestTime: TimeOfDaySchema,
    quietHoursEnabled: z.boolean(),
    quietHoursStart: TimeOfDaySchema,
    quietHoursEnd: TimeOfDaySchema,
    // Empty string = the server's time zone (TZ env var)
    timezone: z.union([z.literal(''), TimeZoneSchema]),
  })
  .meta({
    description:
      'Default quiet hours and digest batching for media-available user notifications',
  })

export const NotificationDeliveryDefaultsUpdateSchema =
  NotificationDeliveryDefaultsSchema.partial()

/** Per-user overrides; null (or absent) inherits the admin default. */
export const UserDeliveryScheduleSchema = z.object({
  notify_digest_mode: DigestModeSchema.nullable().optional(),
  notify_digest_window_minutes: DigestWindowMinutesSchema.nullable().optional(),
  notify_digest_time: TimeOfDaySchema.nullable().optional(),
  notify_quiet_hours_enabled: z.boolean().nullable().optional(),
  notify_quiet_hours_start: TimeOfDaySchema.nullable().optional(),
  notify_quiet_hours_end: TimeOfDaySchema.nullable().optional(),
  notify_timezone: TimeZoneSchema.nullable().optional(),
})

export type DigestMode = z.infer<typeof DigestModeSchema>
export type NotificationDeliveryDefaults = z.infer<
  typeof NotificationDeliveryDefaultsSchema
>
export type UserDeliverySchedule = z.infer<typeof UserDeliveryScheduleSchema>

/** Upgrade default: deliver everything immediately, as before. */
export const DEFAULT_NOTIFICATION_DELIVERY: NotificationDeliveryDefaults = {
  digestMode: 'off',
  digestWindowMinutes: 15,
  digestTime: '09:00',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  timezone: '',
}
