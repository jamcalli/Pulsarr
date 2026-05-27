import { AlertTriangle, Check, Loader2, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import type { BulkExclusionStatus } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-bulk-modal'

interface WatchlistExclusionsBulkRemoveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  actionStatus: BulkExclusionStatus
  count: number
}

export function WatchlistExclusionsBulkRemoveModal({
  open,
  onOpenChange,
  onConfirm,
  actionStatus,
  count,
}: WatchlistExclusionsBulkRemoveModalProps) {
  const isLoading = actionStatus === 'loading'
  const isBusy = actionStatus !== 'idle'

  const handleOpenChange = (next: boolean) => {
    if (isLoading) return
    onOpenChange(next)
  }

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      <CredenzaContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Bulk Remove Exclusions
          </CredenzaTitle>
          <CredenzaDescription>
            Removing {count} {count === 1 ? 'exclusion' : 'exclusions'}
          </CredenzaDescription>
        </CredenzaHeader>

        <CredenzaBody className="space-y-4">
          <Alert variant="error" className="break-words">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription className="text-sm">
              You are about to remove {count}{' '}
              {count === 1 ? 'exclusion' : 'exclusions'}. Any matching items
              still on a watchlist may be routed to Sonarr/Radarr during the
              next sync cycle.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={onConfirm}
                disabled={isBusy}
                className="min-w-[100px] flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : actionStatus === 'success' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Removed
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Bulk Remove ({count})
                  </>
                )}
              </Button>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => handleOpenChange(false)}
                disabled={isBusy}
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
