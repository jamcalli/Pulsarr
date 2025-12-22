import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'

interface WebhookEndpointDeleteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  endpointName: string
  isDeleting: boolean
}

/**
 * Renders a modal dialog prompting the user to confirm deletion of a webhook endpoint.
 *
 * @param endpointName - The name of the endpoint to be deleted, displayed in the confirmation message.
 */
export function WebhookEndpointDeleteModal({
  open,
  onOpenChange,
  onConfirm,
  endpointName,
  isDeleting,
}: WebhookEndpointDeleteModalProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Delete Webhook Endpoint?
          </CredenzaTitle>
          <CredenzaDescription>
            Are you sure you want to delete "{endpointName}"? This action cannot
            be undone and any integrations using this endpoint will stop
            receiving events.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <CredenzaFooter>
            <CredenzaClose asChild>
              <Button variant="neutral">Cancel</Button>
            </CredenzaClose>
            <Button
              variant="clear"
              onClick={() => {
                onConfirm()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}
