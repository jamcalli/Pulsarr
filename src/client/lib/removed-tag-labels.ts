import type { components } from '@/types/api.js'

export const REMOVED_TAG_MODE_LABELS: Record<
  components['schemas']['RemovedTagMode'],
  string
> = {
  remove: 'Remove the tag',
  keep: 'Keep the tag',
  'special-tag': 'Swap for a removed tag',
}
