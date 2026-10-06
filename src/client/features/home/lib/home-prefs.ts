import { type PrefDef, parseOneOf } from '@/lib/prefs'

function oneOfNumbers<const T extends readonly number[]>(values: T) {
  return (raw: string): T[number] | undefined =>
    values.find((value) => String(value) === raw)
}

export const MEDIA_VIEWS = ['carousel', 'list'] as const
export const RECENT_LIMITS = [10, 20, 30, 50] as const
export const RECENT_STATUSES = [
  'all',
  'pending_approval',
  'requested',
  'available',
] as const

export const APPROVAL_SORTS = ['oldest', 'newest'] as const

export type MediaView = (typeof MEDIA_VIEWS)[number]
export type RecentStatus = (typeof RECENT_STATUSES)[number]
export type ApprovalSort = (typeof APPROVAL_SORTS)[number]

export const recentViewPref: PrefDef<MediaView> = {
  key: 'pulsarr-recent-requests-view',
  fallback: 'carousel',
  parse: parseOneOf(MEDIA_VIEWS),
  serialize: (value) => value,
}

export const recentLimitPref: PrefDef<(typeof RECENT_LIMITS)[number]> = {
  key: 'pulsarr-recent-requests-limit',
  fallback: 10,
  parse: oneOfNumbers(RECENT_LIMITS),
  serialize: String,
}

export const recentStatusPref: PrefDef<RecentStatus> = {
  key: 'pulsarr-recent-requests-status',
  fallback: 'all',
  parse: parseOneOf(RECENT_STATUSES),
  serialize: (value) => value,
}

export const approvalsSortPref: PrefDef<ApprovalSort> = {
  key: 'pulsarr-approvals-sort',
  fallback: 'oldest',
  parse: parseOneOf(APPROVAL_SORTS),
  serialize: (value) => value,
}

export const DASHBOARD_DAYS = [7, 30, 90, 0] as const
export const RANKING_LIMITS = [5, 10, 25, 50] as const

export type DashboardDays = (typeof DASHBOARD_DAYS)[number]

export const dashboardDaysPref: PrefDef<DashboardDays> = {
  key: 'pulsarr-rankings-days',
  fallback: 30,
  parse: oneOfNumbers(DASHBOARD_DAYS),
  serialize: String,
}

export const rankingLimitPref: PrefDef<(typeof RANKING_LIMITS)[number]> = {
  key: 'pulsarr-rankings-limit',
  fallback: 10,
  parse: oneOfNumbers(RANKING_LIMITS),
  serialize: String,
}

export const rankingViewPref: PrefDef<MediaView> = {
  key: 'pulsarr-rankings-view',
  fallback: 'carousel',
  parse: parseOneOf(MEDIA_VIEWS),
  serialize: (value) => value,
}
