import { AlertTriangle, Ban, Check, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import type { BulkExclusionStatus } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-bulk-modal'

interface WatchlistExclusionsExcludeConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  actionStatus: BulkExclusionStatus
  title: string
  username: string
  status: string
}

export function WatchlistExclusionsExcludeConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  actionStatus,
  title,
  username,
  status,
}: WatchlistExclusionsExcludeConfirmationModalProps) {
  const isInLibrary = status === 'grabbed' || status === 'notified'
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
            Exclude Watchlist Item
          </CredenzaTitle>
          <CredenzaDescription>
            Excluding "{title}" for {username}
          </CredenzaDescription>
        </CredenzaHeader>

        <CredenzaBody className="space-y-4">
          <Alert variant="warn" className="break-words">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription className="text-sm">
              {isInLibrary
                ? `This will block "${title}" from being routed for ${username}. "${title}" is already in your library, so the next Delete Sync run will remove it.`
                : `This will block "${title}" from being routed for ${username} on future sync cycles.`}
            </AlertDescription>
          </Alert>
        </CredenzaBody>

        <CredenzaFooter>
          <Button
            onClick={() => handleOpenChange(false)}
            disabled={isBusy}
            variant="neutral"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
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
                Exclude
              </>
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
