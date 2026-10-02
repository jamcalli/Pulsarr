import { Loader2 } from 'lucide-react'
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

interface DeleteRouteAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  routeName: string
  routeType?: string
  isDeleting?: boolean
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
  isDeleting = false,
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
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral" disabled={isDeleting}>
              Cancel
            </Button>
          </CredenzaClose>
          <Button
            variant="clear"
            onClick={() => {
              onConfirm()
            }}
            disabled={isDeleting}
            className="flex items-center gap-2"
          >
            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Remove
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}

export default DeleteRouteAlert
