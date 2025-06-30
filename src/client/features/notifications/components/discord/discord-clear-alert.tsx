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

interface DiscordClearAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  title: string
  description: string
}

/**
 * Displays a confirmation alert dialog for clearing Discord-related data.
 *
 * Renders a modal with a customizable title and description, providing "Cancel" and "Clear" actions. The "Clear" button triggers the provided confirmation callback and then closes the alert.
 *
 * @param open - Whether the alert dialog is visible
 * @param onOpenChange - Callback to update the open state of the alert
 * @param onConfirm - Async function executed when the "Clear" action is confirmed
 * @param title - Title text displayed in the alert
 * @param description - Description text displayed in the alert
 * @returns The rendered alert dialog component
 */
export function DiscordClearAlert({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
}: DiscordClearAlertProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">{title}</CredenzaTitle>
          <CredenzaDescription>{description}</CredenzaDescription>
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
                onOpenChange(false)
              }}
            >
              Clear
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}

export default DiscordClearAlert
