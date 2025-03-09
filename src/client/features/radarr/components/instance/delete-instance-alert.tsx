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

interface DeleteGenreRouteAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  routeName: string
}

export function DeleteGenreRouteAlert({
  open,
  onOpenChange,
  onConfirm,
  routeName,
}: DeleteGenreRouteAlertProps) {
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-text">
            Remove Genre Route?
          </CredenzaTitle>
          <CredenzaDescription>
            {`Are you sure you want to remove the genre route "${routeName}"? This action cannot be undone.`}
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
          <CredenzaTitle className="text-text">
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
