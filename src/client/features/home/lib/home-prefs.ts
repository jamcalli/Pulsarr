import {
  DEFAULT_HOME_ROWS,
  HOME_CARD_IDS,
  type HomeCardId,
  type HomeRow,
  normalizeRows,
} from '@/features/home/lib/home-layout'
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

export interface HomeLayout {
  rows: HomeCardId[][]
  hidden: HomeCardId[]
}

function isHomeCardId(value: unknown): value is HomeCardId {
  return HOME_CARD_IDS.some((id) => id === value)
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string')
}

/** Drops unknown and repeated ids and appends cards missing from both lists as their own rows, so cards added later still show. */
export function parseHomeLayout(raw: string): HomeLayout | undefined {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const { rows, hidden } = parsed
    if (!Array.isArray(rows) || !rows.every(isStringList)) return undefined
    if (!isStringList(hidden)) return undefined
    const placed = new Set<HomeCardId>()
    const keptRows = rows
      .map((row) =>
        row.filter(isHomeCardId).filter((id) => {
          if (placed.has(id)) return false
          placed.add(id)
          return true
        }),
      )
      .filter((row) => row.length > 0)
    const keptHidden = [...new Set(hidden.filter(isHomeCardId))]
    const missing = HOME_CARD_IDS.filter(
      (id) => !placed.has(id) && !keptHidden.includes(id),
    )
    return {
      rows: [...keptRows, ...missing.map((id) => [id])],
      hidden: keptHidden,
    }
  } catch {
    return undefined
  }
}

export const homeLayoutPref: PrefDef<HomeLayout> = {
  key: 'pulsarr-home-layout',
  fallback: { rows: DEFAULT_HOME_ROWS.map((row) => [...row]), hidden: [] },
  parse: parseHomeLayout,
  serialize: (value) => JSON.stringify(value),
}

export function visibleRows(layout: HomeLayout): HomeRow[] {
  return normalizeRows(
    layout.rows.map((row) => row.filter((id) => !layout.hidden.includes(id))),
  )
}
