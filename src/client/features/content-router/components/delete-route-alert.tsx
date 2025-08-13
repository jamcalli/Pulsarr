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

interface DeleteRouteAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  routeName: string
  routeType?: string
}

/**
 * Renders a modal dialog that prompts the user to confirm deletion of a route.
 *
 * The dialog displays the route's type and name, warns that deletion is irreversible, and provides options to cancel or proceed with removal.
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
