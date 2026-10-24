import type {
  ActionResultRow,
  ActionResultStat,
} from '@/components/settings/action-results'
import { failedStat } from '@/lib/action-state'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'
import type { components } from '@/types/api.js'

type Schemas = components['schemas']

function perTarget<T>(
  response: { sonarr: T; radarr: T },
  toStats: (stats: T, target: 'sonarr' | 'radarr') => ActionResultStat[],
): ActionResultRow[] {
  return [
    {
      target: ARR_TYPE_LABELS.sonarr,
      stats: toStats(response.sonarr, 'sonarr'),
    },
    {
      target: ARR_TYPE_LABELS.radarr,
      stats: toStats(response.radarr, 'radarr'),
    },
  ]
}

function orphanStats(
  stats: Schemas['TagCleanupStats'] | undefined,
): ActionResultStat[] {
  if (!stats) return []
  return [
    { label: 'Orphans removed', value: stats.removed },
    { label: 'Orphans skipped', value: stats.skipped },
    failedStat('Orphans failed', stats.failed),
  ]
}

export function createResultRows(
  response: Schemas['CreateTaggingResponse'],
): ActionResultRow[] {
  return perTarget(response, (stats) => [
    { label: 'Created', value: stats.created },
    { label: 'Skipped', value: stats.skipped },
    { label: 'Instances', value: stats.instances },
    failedStat('Failed', stats.failed),
  ])
}

export function syncResultRows(
  response: Schemas['SyncTaggingResponse'],
): ActionResultRow[] {
  return perTarget(response, (stats, target) => [
    { label: 'Tagged', value: stats.tagged },
    { label: 'Skipped', value: stats.skipped },
    failedStat('Failed', stats.failed),
    ...orphanStats(response.orphanedCleanup?.[target]),
  ])
}

export function cleanupResultRows(
  response: Schemas['TagCleanupResponse'],
): ActionResultRow[] {
  return perTarget(response, (stats) => [
    { label: 'Removed', value: stats.removed },
    { label: 'Skipped', value: stats.skipped },
    { label: 'Instances', value: stats.instances },
    failedStat('Failed', stats.failed),
  ])
}

export function removeResultRows(
  response: Schemas['RemoveTagsResponse'],
): ActionResultRow[] {
  return perTarget(response, (stats) => [
    { label: 'Items updated', value: stats.itemsUpdated },
    { label: 'Tags removed', value: stats.tagsRemoved },
    { label: 'Tags deleted', value: stats.tagsDeleted },
    { label: 'Instances', value: stats.instances },
    failedStat('Failed', stats.failed),
  ])
}
