import type { RowSelectionState } from '@tanstack/react-table'
import { useState } from 'react'

export interface BulkFailure {
  message: string
  detail: string | null
}

interface Selection {
  scope: string
  visit: number
  rows: RowSelectionState
  failure: BulkFailure | null
}

function selectedIn(rows: RowSelectionState): boolean {
  return Object.values(rows).some(Boolean)
}

function emptySelection(scope: string, visit: number): Selection {
  return { scope, visit, rows: {}, failure: null }
}

/** Selection and its bulk failure reset whenever `scope` changes, and clearing the rows clears the failure. */
export function useScopedSelection(scope: string) {
  const [selection, setSelection] = useState(() => emptySelection(scope, 0))
  if (selection.scope !== scope) {
    setSelection(emptySelection(scope, selection.visit + 1))
  }
  const { visit } = selection

  const updateInVisit = (update: (prev: Selection) => Selection) =>
    setSelection((prev) => (prev.visit === visit ? update(prev) : prev))

  return {
    rows: selection.rows,
    failure: selection.failure,
    select: (rows: RowSelectionState) =>
      updateInVisit((prev) => ({
        ...prev,
        rows,
        failure: selectedIn(rows) ? prev.failure : null,
      })),
    clear: () => updateInVisit((prev) => emptySelection(prev.scope, visit)),
    /** Keeps exactly `ids` selected, such as the rows a bulk action failed on. */
    settle: (
      ids: ReadonlyArray<string | number>,
      failure: BulkFailure | null,
    ) =>
      updateInVisit((prev) => ({
        ...prev,
        rows: Object.fromEntries(ids.map((id) => [String(id), true])),
        failure,
      })),
    setFailure: (failure: BulkFailure | null) =>
      updateInVisit((prev) => ({ ...prev, failure })),
  }
}
