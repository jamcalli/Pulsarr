import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import { pluralize } from '@root/utils/pluralize.js'

const DRY_RUN_SUMMARY_TEXT = 'This was a dry run, so nothing was deleted.'

const SAFETY_FALLBACK_TEXT =
  'A safety check prevented the delete sync operation from running.'

const REMOVED_TEXT = 'Removed because no user has them on a watchlist anymore.'

const SHOWN_ITEM_LIMIT = 10

interface SectionNoun {
  singular: string
  plural: string
}

export interface DeleteSyncSection {
  label: string
  noun: SectionNoun
  deleted: number
  /** `11 deleted, 2 protected`, empty when nothing was deleted. */
  meta: string
  shown: string[]
  remaining: number
}

export interface DeleteSyncSummary {
  title: string
  dryRun: boolean
  /** Unset when safety triggered, since `safetyMessage` carries the reason. */
  summaryText: string | undefined
  protectedText: string | undefined
  /** Set exactly when safety triggered. */
  safetyMessage: string | undefined
  totals: DeleteSyncResult['total']
  movies: DeleteSyncSection
  shows: DeleteSyncSection
}

export function sectionMoreText(section: DeleteSyncSection): string {
  const { remaining, noun } = section
  return `+${remaining} more ${pluralize(remaining, noun.singular, noun.plural)}`
}

export function sectionEmptyText(section: DeleteSyncSection): string {
  return `No ${section.noun.plural} deleted`
}

function sectionMeta(
  section: DeleteSyncResult['movies'],
  dryRun: boolean,
): string {
  if (section.deleted <= 0) return ''
  const deleted = `${section.deleted} ${dryRun ? 'would be deleted' : 'deleted'}`
  return section.protected && section.protected > 0
    ? `${deleted}, ${section.protected} protected`
    : deleted
}

function toSection(
  label: string,
  noun: SectionNoun,
  section: DeleteSyncResult['movies'],
  dryRun: boolean,
): DeleteSyncSection {
  const shown = section.items
    .slice(0, SHOWN_ITEM_LIMIT)
    .map((item) => item.title)

  return {
    label,
    noun,
    deleted: section.deleted,
    meta: sectionMeta(section, dryRun),
    shown,
    remaining: section.items.length - shown.length,
  }
}

function heading(
  results: DeleteSyncResult,
  dryRun: boolean,
): Pick<DeleteSyncSummary, 'title' | 'summaryText'> {
  if (results.safetyTriggered) {
    return {
      title: 'Delete sync safety triggered',
      summaryText: undefined,
    }
  }
  if (dryRun) {
    return {
      title: 'Delete sync simulation results',
      summaryText: DRY_RUN_SUMMARY_TEXT,
    }
  }
  return {
    title: 'Delete sync results',
    summaryText: REMOVED_TEXT,
  }
}

export function summarizeDeleteSync(
  results: DeleteSyncResult,
  dryRun: boolean,
): DeleteSyncSummary {
  return {
    ...heading(results, dryRun),
    dryRun,
    protectedText:
      results.total.protected && results.total.protected > 0
        ? `${results.total.protected} items were preserved because they are in protected playlists.`
        : undefined,
    safetyMessage: results.safetyTriggered
      ? results.safetyMessage || SAFETY_FALLBACK_TEXT
      : undefined,
    totals: results.total,
    movies: toSection(
      'Movies',
      { singular: 'movie', plural: 'movies' },
      results.movies,
      dryRun,
    ),
    shows: toSection(
      'TV shows',
      { singular: 'TV show', plural: 'TV shows' },
      results.shows,
      dryRun,
    ),
  }
}
