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

interface DeleteInstanceAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  instanceName: string
  isLastInstance: boolean
}

/**
 * Renders a modal dialog prompting the user to confirm deletion or clearing of an instance configuration.
 *
 * The dialog displays context-sensitive titles, descriptions, and button labels based on whether the targeted instance is the last one. On confirmation, the provided callback is invoked and the modal is closed.
 *
 * @param open - Whether the modal is visible
 * @param onOpenChange - Callback to update the modal's open state
 * @param onConfirm - Callback triggered when the user confirms the action
 * @param instanceName - Name of the instance being deleted or cleared
 * @param isLastInstance - Indicates if the instance is the last one, affecting dialog content
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
