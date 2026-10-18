import { compareText } from '@/lib/format'
import type { components } from '@/types/api.js'

type ResultItem = components['schemas']['DeleteSyncResultItem']

export const DRY_RUN_TABS = ['movies', 'shows'] as const

export type DryRunTab = (typeof DRY_RUN_TABS)[number]

export const DRY_RUN_TYPES: Record<DryRunTab, { label: string; noun: string }> =
  {
    movies: { label: 'Movies', noun: 'movie' },
    shows: { label: 'Shows', noun: 'show' },
  }

export const DRY_RUN_SORT_KEYS = ['title', 'instance', 'guid'] as const

type DryRunSortKey = (typeof DRY_RUN_SORT_KEYS)[number]

export interface DryRunSort {
  id: DryRunSortKey
  desc: boolean
}

export interface DryRunItemRow {
  id: string
  title: string
  instance: string
  guid: string
}

/** `instanceName` maps the instance id the server sends to its name. */
export function dryRunRows(
  items: readonly ResultItem[],
  instanceName: (id: string) => string,
): DryRunItemRow[] {
  return items.map((item, index) => ({
    id: `${item.instance}-${item.guid}-${index}`,
    title: item.title,
    instance: instanceName(item.instance),
    guid: item.guid,
  }))
}

/** Rows whose title or GUID contains the search, sorted with title as the tiebreak. */
export function visibleDryRunRows(
  rows: readonly DryRunItemRow[],
  search: string,
  sort: DryRunSort,
): DryRunItemRow[] {
  const needle = search.trim().toLowerCase()
  const direction = sort.desc ? -1 : 1
  return rows
    .filter(
      (row) =>
        needle === '' ||
        row.title.toLowerCase().includes(needle) ||
        row.guid.toLowerCase().includes(needle),
    )
    .sort(
      (a, b) =>
        compareText(a[sort.id], b[sort.id]) * direction ||
        compareText(a.title, b.title),
    )
}
