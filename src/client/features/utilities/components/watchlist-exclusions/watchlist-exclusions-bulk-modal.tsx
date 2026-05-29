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
  CredenzaFooter,
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
          if (row.status && IN_LIBRARY_STATUSES.has(row.status)) inLibrary++
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
  const isBusy = actionStatus !== 'idle'

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
          <Alert variant="warn" className="break-words">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription className="text-sm">
              You are about to exclude {excludableRows.length} watchlist{' '}
              {excludableRows.length === 1 ? 'item' : 'items'}. Future sync
              cycles will skip routing for{' '}
              {excludableRows.length === 1 ? 'it' : 'them'}.
              {canExclude && inLibraryCount > 0 && (
                <div className="mt-2">
                  {inLibraryCount}{' '}
                  {inLibraryCount === 1 ? 'of them is' : 'of them are'} already
                  in your library, so the next Delete Sync run will remove{' '}
                  {inLibraryCount === 1 ? 'it' : 'them'}.
                </div>
              )}
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

          {canExclude && (
            <>
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox
                  id={globalScopeId}
                  checked={scope === 'global'}
                  onCheckedChange={(checked) =>
                    setScope(checked ? 'global' : 'per-user')
                  }
                  disabled={isBusy}
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
        </CredenzaBody>

        <CredenzaFooter>
          <Button
            onClick={() => handleOpenChange(false)}
            disabled={isBusy}
            variant="neutral"
          >
            Cancel
          </Button>
          {canExclude && (
            <Button
              onClick={handleExclude}
              disabled={isBusy}
              variant="clear"
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
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
