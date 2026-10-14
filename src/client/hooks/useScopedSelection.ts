import type { RowSelectionState } from '@tanstack/react-table'
import { useState } from 'react'

export interface BulkFailure {
  message: string
  detail: string | null
}

interface Selection {
  scope: string
  rows: RowSelectionState
  failure: BulkFailure | null
}

function selectedIn(rows: RowSelectionState): boolean {
  return Object.values(rows).some(Boolean)
}

function emptySelection(scope: string): Selection {
  return { scope, rows: {}, failure: null }
}

/** Selection and its bulk failure reset whenever `scope` changes, and clearing the rows clears the failure. */
export function useScopedSelection(scope: string) {
  const [selection, setSelection] = useState(() => emptySelection(scope))
  if (selection.scope !== scope) setSelection(emptySelection(scope))

  const updateInScope = (update: (prev: Selection) => Selection) =>
    setSelection((prev) => (prev.scope === scope ? update(prev) : prev))

  return {
    rows: selection.rows,
    failure: selection.failure,
    select: (rows: RowSelectionState) =>
      updateInScope((prev) => ({
        scope,
        rows,
        failure: selectedIn(rows) ? prev.failure : null,
      })),
    clear: () => updateInScope(() => emptySelection(scope)),
    /** Keeps exactly `ids` selected, such as the rows a bulk action failed on. */
    settle: (ids: ReadonlyArray<number>, failure: BulkFailure | null) =>
      updateInScope(() => ({
        scope,
        rows: Object.fromEntries(ids.map((id) => [String(id), true])),
        failure,
      })),
    setFailure: (failure: BulkFailure | null) =>
      updateInScope((prev) => ({ ...prev, failure })),
  }
}
