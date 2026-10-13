import { RecentRequestStatusSchema } from '@root/schemas/shared/recent-request.schema'
import { type PrefDef, parseOneOf, parseOneOfNumbers } from '@/lib/prefs'

export const MEDIA_VIEWS = ['carousel', 'list'] as const
export const RECENT_LIMITS = [10, 20, 30, 50] as const
export const RECENT_STATUSES = [
  'all',
  ...RecentRequestStatusSchema.options,
] as const

export type MediaView = (typeof MEDIA_VIEWS)[number]
export type RecentStatus = (typeof RECENT_STATUSES)[number]

export const recentViewPref: PrefDef<MediaView> = {
  key: 'pulsarr-recent-requests-view',
  fallback: 'carousel',
  parse: parseOneOf(MEDIA_VIEWS),
  serialize: (value) => value,
}

export const recentLimitPref: PrefDef<(typeof RECENT_LIMITS)[number]> = {
  key: 'pulsarr-recent-requests-limit',
  fallback: 10,
  parse: parseOneOfNumbers(RECENT_LIMITS),
  serialize: String,
}

export const recentStatusPref: PrefDef<RecentStatus> = {
  key: 'pulsarr-recent-requests-status',
  fallback: 'all',
  parse: parseOneOf(RECENT_STATUSES),
  serialize: (value) => value,
}
