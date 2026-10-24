import { type PrefDef, parseOneOfNumbers } from '@/lib/prefs'

export const PAGE_SIZES = [10, 20, 30, 40, 50] as const

export type PageSize = (typeof PAGE_SIZES)[number]

export const DEFAULT_PAGE_SIZE: PageSize = 20

export function pageSizePref(table: string): PrefDef<PageSize> {
  return {
    key: `pulsarr-table-${table}-pageSize`,
    fallback: DEFAULT_PAGE_SIZE,
    parse: parseOneOfNumbers(PAGE_SIZES),
    serialize: String,
  }
}
