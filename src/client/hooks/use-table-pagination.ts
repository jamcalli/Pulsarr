import { useCallback, useState } from 'react'

/**
 * React hook that manages and persists a table's page size setting in localStorage.
 *
 * Initializes the page size for a table identified by `tableKey`, using a stored value from localStorage if available and valid (between 1 and 100), or falling back to `defaultPageSize`. Provides a setter function that validates and updates both localStorage and state.
 *
 * @param tableKey - Unique identifier for the table (e.g., 'users', 'approvals')
 * @param defaultPageSize - Default page size if none is stored (default: 20)
 * @returns An object containing the current `pageSize` and a `setPageSize` function to update it
 */
export function useTablePagination(tableKey: string, defaultPageSize = 20) {
  const storageKey = `pulsarr-table-${tableKey}-pageSize`
  
  const [pageSize, setPageSizeState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        // Validate that it's a reasonable page size
        if (typeof parsed === 'number' && parsed > 0 && parsed <= 100) {
          return parsed
        }
      }
    } catch (error) {
      console.warn(`Failed to load table pagination for ${tableKey}:`, error)
    }
    return defaultPageSize
  })

  const setPageSize = useCallback((newPageSize: number) => {
    try {
      // Validate page size before storing
      if (typeof newPageSize === 'number' && newPageSize > 0 && newPageSize <= 100) {
        localStorage.setItem(storageKey, JSON.stringify(newPageSize))
        setPageSizeState(newPageSize)
      } else {
        console.warn(`Invalid page size for ${tableKey}:`, newPageSize)
      }
    } catch (error) {
      console.error(`Failed to save table pagination for ${tableKey}:`, error)
      // Still update state even if localStorage fails
      setPageSizeState(newPageSize)
    }
  }, [storageKey, tableKey])


  return {
    pageSize,
    setPageSize,
  }
}