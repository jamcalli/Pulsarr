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

/** Selection and its bulk failure reset whenever `scope` changes, and clearing the rows clears the failure. */
export function useScopedSelection(scope: string) {
  const [selection, setSelection] = useState<Selection>({
    scope,
    rows: {},
    failure: null,
  })
  const current =
    selection.scope === scope ? selection : { scope, rows: {}, failure: null }

  return {
    rows: current.rows,
    failure: current.failure,
    select: (rows: RowSelectionState) =>
      setSelection({
        scope,
        rows,
        failure: selectedIn(rows) ? current.failure : null,
      }),
    clear: () => setSelection({ scope, rows: {}, failure: null }),
    /** Keeps exactly `ids` selected, such as the rows a bulk action failed on. */
    settle: (ids: ReadonlyArray<number>, failure: BulkFailure | null) =>
      setSelection({
        scope,
        rows: Object.fromEntries(ids.map((id) => [String(id), true])),
        failure,
      }),
    setFailure: (failure: BulkFailure | null) =>
      setSelection({ ...current, failure }),
  }
}
