import { type PrefDef, parseOneOf, parseOneOfNumbers } from '@/lib/prefs'
import { MEDIA_VIEWS, type MediaView } from '@/lib/request-list-prefs'

export const APPROVAL_SORTS = ['oldest', 'newest'] as const

export type ApprovalSort = (typeof APPROVAL_SORTS)[number]

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
  parse: parseOneOfNumbers(DASHBOARD_DAYS),
  serialize: String,
}

export const rankingLimitPref: PrefDef<(typeof RANKING_LIMITS)[number]> = {
  key: 'pulsarr-rankings-limit',
  fallback: 10,
  parse: parseOneOfNumbers(RANKING_LIMITS),
  serialize: String,
}

export const rankingViewPref: PrefDef<MediaView> = {
  key: 'pulsarr-rankings-view',
  fallback: 'carousel',
  parse: parseOneOf(MEDIA_VIEWS),
  serialize: (value) => value,
}
