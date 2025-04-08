import {
  Credenza,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaDescription,
  CredenzaBody,
  CredenzaFooter,
  CredenzaClose,
} from '@/components/ui/credenza'
import { Button } from '@/components/ui/button'

interface DeleteRouteAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  routeName: string
  routeType?: string
}

/**
 * Renders a confirmation dialog to delete a specific route.
 *
 * The alert displays a title and descriptive message incorporating the route type and name, warning that deletion is irreversible. It offers options to cancel (which updates the alert's visibility) or confirm the deletion.
 *
 * @param open - Controls whether the alert is visible.
 * @param onOpenChange - Callback to update the alert's open state.
 * @param onConfirm - Callback invoked when the deletion is confirmed.
 * @param routeName - The name of the route to be deleted.
 * @param routeType - The type of the route; defaults to "routing rule".
 */
export function DeleteRouteAlert({
  open,
  onOpenChange,
  onConfirm,
  routeName,
  routeType = 'routing rule',
}: DeleteRouteAlertProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-text">
            Remove {routeType}?
          </CredenzaTitle>
          <CredenzaDescription>
            {`Are you sure you want to remove the ${routeType} "${routeName}"? This action cannot be undone.`}
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
            >
              Remove
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}

export default DeleteRouteAlert
