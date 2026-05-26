import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'

interface WatchlistExclusionsBulkRemoveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isSubmitting: boolean
  count: number
}

export function WatchlistExclusionsBulkRemoveModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  count,
}: WatchlistExclusionsBulkRemoveModalProps) {
  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return
    onOpenChange(next)
  }

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Remove {count} {count === 1 ? 'Exclusion' : 'Exclusions'}?
          </CredenzaTitle>
          <CredenzaDescription>
            This will remove {count} {count === 1 ? 'exclusion' : 'exclusions'}.
            Any matching items still on a watchlist may be routed to
            Sonarr/Radarr during the next sync cycle.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral" disabled={isSubmitting}>
              Cancel
            </Button>
          </CredenzaClose>
          <Button variant="clear" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Removing...' : `Remove ${count}`}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
