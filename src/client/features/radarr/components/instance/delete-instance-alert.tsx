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

interface DeleteInstanceAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  instanceName: string
  isLastInstance: boolean
}

/**
 * Displays a modal dialog for confirming the deletion or clearing of an instance configuration.
 *
 * The dialog's title, description, and confirmation button label adjust based on whether the targeted instance is the last one. When confirmed, the provided callback is executed and the modal closes.
 *
 * @param instanceName - Name of the instance targeted for deletion or clearing
 * @param isLastInstance - Whether this is the last instance, affecting dialog content and actions
 * @returns The confirmation modal component
 */
export function DeleteInstanceAlert({
  open,
  onOpenChange,
  onConfirm,
  instanceName,
  isLastInstance,
}: DeleteInstanceAlertProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            {isLastInstance
              ? 'Clear Instance Configuration?'
              : 'Remove Instance?'}
          </CredenzaTitle>
          <CredenzaDescription>
            {isLastInstance
              ? `The configuration for ${instanceName} will be deleted.`
              : `Are you sure you want to remove ${instanceName}? This action cannot be undone.`}
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
                onOpenChange(false)
              }}
            >
              {isLastInstance ? 'Clear' : 'Remove'}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}

export default DeleteInstanceAlert
