import type { ActionSpec } from '@/components/settings/actions-section'
import type { ActionState } from '@/lib/action-state'

export interface SyncActionCopy<Id extends string> {
  id: Id
  title: string
  description: string
  buttonLabel: string
  busyLabel: string
}

/** The remove row is destructive and calls onRemove so the page can confirm first. */
export function syncActionSpecs<Id extends string>(
  rows: readonly SyncActionCopy<Id | 'remove'>[],
  states: Record<Id | 'remove', ActionState>,
  run: (id: Id) => void,
  onRemove: () => void,
): ActionSpec[] {
  return rows.map(({ id, ...copy }) => ({
    ...copy,
    id,
    destructive: id === 'remove',
    state: states[id],
    onRun: id === 'remove' ? onRemove : () => run(id),
  }))
}
