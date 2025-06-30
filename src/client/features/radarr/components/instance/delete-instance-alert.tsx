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
