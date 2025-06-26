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
 * Renders a confirmation dialog for deleting a route.
 *
 * This component displays a modal alert that asks the user to confirm the deletion of a specified route,
 * with the text dynamically reflecting the provided route type and name. It offers options to cancel or
 * proceed with the deletion.
 *
 * @param open - Indicates whether the alert is visible.
 * @param onOpenChange - Callback to update the dialog's visibility.
 * @param onConfirm - Function executed when the user confirms deletion; typically returns a Promise.
 * @param routeName - The name of the route to be deleted.
 * @param routeType - The type of the route, defaults to "routing rule".
 *
 * @returns A JSX element representing the deletion confirmation dialog.
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
