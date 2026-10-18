import { PLEX_PROTECTION_PLAYLIST_DEFAULT } from '@root/schemas/shared/delete-sync-limits'
import {
  DRY_RUN_TYPES,
  type DryRunTab,
} from '@/features/library/lib/delete-sync/dry-run-items'
import {
  formatCount,
  formatNumber,
  formatTime,
  formatTimeOfDay,
  formatWeekday,
  upperFirst,
} from '@/lib/format'
import { REMOVED_TAG_MODE_LABELS } from '@/lib/removed-tag-labels'
import { parseDayTimeCron } from '@/lib/schedule'
import type { components } from '@/types/api.js'

type DeleteSyncResult = components['schemas']['DeleteSyncResult']

function filesClause(deleteFiles: boolean): string {
  return deleteFiles ? ', files on disk included' : ''
}

function wouldDelete(result: DeleteSyncResult): string {
  return `would delete ${formatCount(result.movies.deleted, 'movie')} and ${formatCount(result.shows.deleted, 'show')}`
}

function scheduleWhen(expression: string): string {
  const schedule = parseDayTimeCron(expression)
  if (!schedule) return 'on a custom schedule'
  const days =
    schedule.day === '*'
      ? 'every day'
      : `${formatWeekday(Number(schedule.day))}s`
  return `${days} at ${formatTimeOfDay(schedule.hour, schedule.minute)}`
}

export function scheduleHelp(expression: string): string {
  return `Runs ${scheduleWhen(expression)}, server time.`
}

/** `percent` is undefined while the field holds no valid value. */
export function maxDeletionHelp(percent: number | undefined): string {
  return percent === undefined
    ? 'Aborts a run that would delete more than this share.'
    : `Aborts if a run would delete more than ${formatNumber(percent)}% of eligible items.`
}

export function playlistHelp(name: string): string {
  return `Every run creates "${name || PLEX_PROTECTION_PLAYLIST_DEFAULT}" for Plex users who lack it.`
}

export function removalTagWarning(
  mode: components['schemas']['RemovedTagMode'],
): string {
  return `User tags is set to "${REMOVED_TAG_MODE_LABELS[mode]}", so nothing gets this tag.`
}

export function dryRunSummary(result: DeleteSyncResult): string {
  const processed = formatNumber(result.total.processed)
  return result.safetyTriggered
    ? `${processed} processed.`
    : `${processed} processed. ${upperFirst(wouldDelete(result))}.`
}

export function itemsDescription(
  result: DeleteSyncResult,
  deleteFiles: boolean,
): string {
  return `${upperFirst(wouldDelete(result))}${deleteFiles ? ', files included' : ''}.`
}

export function viewItemsLabel(result: DeleteSyncResult): string {
  return `View ${formatCount(result.movies.items.length + result.shows.items.length, 'item')}`
}

export function itemsCountLine(
  tab: DryRunTab,
  matched: number,
  total: number,
  searching: boolean,
): string {
  const count = formatCount(total, DRY_RUN_TYPES[tab].noun)
  return searching ? `${formatNumber(matched)} of ${count}` : count
}

export function latestDryRunLine(
  result: DeleteSyncResult,
  nothingSelected: boolean,
  ranAt: number,
): string {
  const run = `The dry run at ${formatTime(ranAt)}`
  if (result.safetyTriggered) {
    return `${run} was aborted by the safety check, so nothing would be deleted.`
  }
  if (nothingSelected) return `${run} had nothing selected to delete.`
  return `${run} ${wouldDelete(result)}.`
}

export function runConfirmBody(deleteFiles: boolean): string {
  return `Deletes for real with the saved settings${filesClause(deleteFiles)}. This can't be undone.`
}

export function scheduleConfirmBody(
  expression: string,
  deleteFiles: boolean,
): string {
  return `Delete sync will run ${scheduleWhen(expression)}, server time, and delete for real${filesClause(deleteFiles)}.`
}
