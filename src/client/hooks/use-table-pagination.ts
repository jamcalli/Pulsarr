import { useCallback, useMemo } from 'react'
import { type PrefDef, parseIntInRange, usePref } from '@/lib/prefs'

/**
 * React hook that manages and persists a table's page size preference.
 *
 * Initializes the page size for a table identified by `tableKey`, using a
 * stored value if available and valid (between 1 and 100), or falling back
 * to `defaultPageSize`. The setter rejects out-of-range values.
 *
 * @param tableKey - Unique identifier for the table (e.g., 'users', 'approvals')
 * @param defaultPageSize - Default page size if none is stored (default: 20)
 * @returns An object containing the current `pageSize` and a `setPageSize` function to update it
 */
export function useTablePagination(tableKey: string, defaultPageSize = 20) {
  const def = useMemo<PrefDef<number>>(
    () => ({
      key: `pulsarr-table-${tableKey}-pageSize`,
      fallback: defaultPageSize,
      parse: parseIntInRange(1, 100),
      serialize: JSON.stringify,
    }),
    [tableKey, defaultPageSize],
  )

  const [pageSize, setPageSizePref] = usePref(def)

  const setPageSize = useCallback(
    (newPageSize: number) => {
      if (newPageSize > 0 && newPageSize <= 100) {
        setPageSizePref(newPageSize)
      } else {
        console.warn(`Invalid page size for ${tableKey}:`, newPageSize)
      }
    },
    [setPageSizePref, tableKey],
  )

  return {
    pageSize,
    setPageSize,
  }
}
