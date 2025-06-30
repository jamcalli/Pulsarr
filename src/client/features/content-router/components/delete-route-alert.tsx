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
 * Displays a modal dialog prompting the user to confirm deletion of a route.
 *
 * The dialog shows the route's type and name, warns that deletion is irreversible, and provides options to cancel or proceed.
 *
 * @param open - Whether the dialog is visible.
 * @param onOpenChange - Callback to change the dialog's visibility.
 * @param onConfirm - Function called when the user confirms deletion.
 * @param routeName - Name of the route to delete.
 * @param routeType - Type of the route; defaults to "routing rule".
 *
 * @returns The confirmation dialog as a JSX element.
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
          <CredenzaTitle className="text-foreground">
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
