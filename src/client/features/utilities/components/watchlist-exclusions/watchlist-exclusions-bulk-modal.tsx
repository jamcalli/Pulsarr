import { AlertTriangle, Ban, Check, Loader2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import type { WatchlistExclusionTableRow } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-table-columns'

export type BulkExclusionScope = 'per-user' | 'global'
export type BulkExclusionStatus = 'idle' | 'loading' | 'success' | 'error'

interface WatchlistExclusionsBulkModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRows: WatchlistExclusionTableRow[]
  onBulkExclude: (
    rows: WatchlistExclusionTableRow[],
    scope: BulkExclusionScope,
  ) => Promise<void> | void
  actionStatus: BulkExclusionStatus
}

const IN_LIBRARY_STATUSES = new Set(['grabbed', 'notified'])

export function WatchlistExclusionsBulkModal({
  open,
  onOpenChange,
  selectedRows,
  onBulkExclude,
  actionStatus,
}: WatchlistExclusionsBulkModalProps) {
  const [scope, setScope] = useState<BulkExclusionScope>('per-user')
  const globalScopeId = useId()

  const { excludableRows, alreadyExcludedCount, inLibraryCount } =
    useMemo(() => {
      const excludable: WatchlistExclusionTableRow[] = []
      let alreadyExcluded = 0
      let inLibrary = 0
      for (const row of selectedRows) {
        if (row.isExcluded) {
          alreadyExcluded++
        } else {
          excludable.push(row)
          if (IN_LIBRARY_STATUSES.has(row.status)) inLibrary++
        }
      }
      return {
        excludableRows: excludable,
        alreadyExcludedCount: alreadyExcluded,
        inLibraryCount: inLibrary,
      }
    }, [selectedRows])

  const canExclude = excludableRows.length > 0
  const isLoading = actionStatus === 'loading'

  const handleOpenChange = (next: boolean) => {
    if (isLoading) return
    onOpenChange(next)
  }

  const handleExclude = () => onBulkExclude(excludableRows, scope)

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      <CredenzaContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Bulk Exclude Watchlist Items
          </CredenzaTitle>
          <CredenzaDescription>
            Excluding {excludableRows.length} of {selectedRows.length} selected
            watchlist {selectedRows.length === 1 ? 'item' : 'items'}
          </CredenzaDescription>
        </CredenzaHeader>

        <CredenzaBody className="space-y-4">
          <Alert variant="error" className="break-words">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription className="text-sm">
              You are about to exclude {excludableRows.length} watchlist{' '}
              {excludableRows.length === 1 ? 'item' : 'items'}. Excluded items
              are removed in the Active Exclusions section below.
            </AlertDescription>
          </Alert>

          {alreadyExcludedCount > 0 && (
            <Alert variant="default" className="break-words">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <AlertDescription className="text-sm">
                {alreadyExcludedCount}{' '}
                {alreadyExcludedCount === 1 ? 'item is' : 'items are'} already
                excluded and will be skipped.
              </AlertDescription>
            </Alert>
          )}

          {canExclude && inLibraryCount > 0 && (
            <Alert variant="default" className="break-words">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <AlertDescription className="text-sm">
                {inLibraryCount}{' '}
                {inLibraryCount === 1 ? 'item is' : 'items are'} already in your
                library. The next Delete Sync run will remove{' '}
                {inLibraryCount === 1 ? 'it' : 'them'}.
              </AlertDescription>
            </Alert>
          )}

          {canExclude && (
            <>
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox
                  id={globalScopeId}
                  checked={scope === 'global'}
                  onCheckedChange={(checked) =>
                    setScope(checked ? 'global' : 'per-user')
                  }
                  disabled={isLoading}
                />
                <label
                  htmlFor={globalScopeId}
                  className="text-sm font-medium text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Apply globally to all users
                </label>
              </div>
              <p className="text-xs text-foreground mt-1 ml-6">
                When enabled, vetoes routing of these keys for every current and
                future user. Otherwise, excludes each item only for the user who
                watchlisted it.
              </p>
            </>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-2">
              {canExclude && (
                <Button
                  onClick={handleExclude}
                  disabled={isLoading}
                  className="min-w-[100px] flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Excluding...
                    </>
                  ) : actionStatus === 'success' ? (
                    <>
                      <Check className="h-4 w-4" />
                      Excluded
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4" />
                      Bulk Exclude ({excludableRows.length})
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => handleOpenChange(false)}
                disabled={isLoading}
                variant="neutral"
              >
                Cancel
              </Button>
            </div>
          </div>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}
