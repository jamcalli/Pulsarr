import type { ActionResultRow } from '@/components/settings/action-results'
import { failedStat } from '@/lib/action-state'
import type { components } from '@/types/api.js'

type Schemas = components['schemas']

const TARGET = 'Plex'

export function cleanupLabelResultRows(
  response: Schemas['CleanupPlexLabelsResponse'],
): ActionResultRow[] {
  return [
    {
      target: TARGET,
      stats: [
        { label: 'Expired from queue', value: response.pending.removed },
        failedStat('Queue failed', response.pending.failed),
        { label: 'Orphans removed', value: response.orphaned.removed },
        failedStat('Orphans failed', response.orphaned.failed),
      ],
    },
  ]
}

export function removeLabelResultRows(
  response: Schemas['RemovePlexLabelsResponse'],
): ActionResultRow[] {
  const { processed, removed, failed } = response.results
  return [
    {
      target: TARGET,
      stats: [
        { label: 'Items processed', value: processed },
        { label: 'Labels removed', value: removed },
        failedStat('Failed', failed),
      ],
    },
  ]
}
