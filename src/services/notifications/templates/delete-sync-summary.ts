import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'

const DRY_RUN_SUMMARY_TEXT =
  'This was a dry run - no content was actually deleted.'

const SAFETY_FALLBACK_TEXT =
  'A safety check prevented the delete sync operation from running.'

const REMOVED_TEXT =
  "The following content was removed because it's no longer in any user's watchlist."

const SHOWN_ITEM_LIMIT = 10

export interface DeleteSyncSection {
  label: string
  noun: string
  deleted: number
  protectedInfo: string
  shown: string[]
  remaining: number
}

export interface DeleteSyncSummary {
  title: string
  summaryText: string
  protectedText: string | undefined
  safetyMessage: string | undefined
  totals: DeleteSyncResult['total']
  movies: DeleteSyncSection
  shows: DeleteSyncSection
}

function toSection(
  label: string,
  noun: string,
  section: DeleteSyncResult['movies'],
): DeleteSyncSection {
  const shown = section.items
    .slice(0, SHOWN_ITEM_LIMIT)
    .map((item) => item.title)

  return {
    label,
    noun,
    deleted: section.deleted,
    protectedInfo:
      section.protected && section.protected > 0
        ? ` (${section.protected} protected)`
        : '',
    shown,
    remaining: section.items.length - shown.length,
  }
}

export function summarizeDeleteSync(
  results: DeleteSyncResult,
  dryRun: boolean,
): DeleteSyncSummary {
  let title: string
  let summaryText: string

  if (results.safetyTriggered) {
    title = '⚠️ Delete Sync Safety Triggered'
    summaryText = results.safetyMessage || SAFETY_FALLBACK_TEXT
  } else if (dryRun) {
    title = '🔍 Delete Sync Simulation Results'
    summaryText = DRY_RUN_SUMMARY_TEXT
  } else {
    title = '🗑️ Delete Sync Results'
    summaryText = REMOVED_TEXT
  }

  return {
    title,
    summaryText,
    protectedText:
      results.total.protected && results.total.protected > 0
        ? `${results.total.protected} items were preserved because they are in protected playlists.`
        : undefined,
    safetyMessage:
      results.safetyTriggered && results.safetyMessage
        ? results.safetyMessage
        : undefined,
    totals: results.total,
    movies: toSection('Movies', 'movies', results.movies),
    shows: toSection('TV Shows', 'TV shows', results.shows),
  }
}
