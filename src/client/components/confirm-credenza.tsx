import type { ReactNode } from 'react'
import { BusyLabel } from '@/components/busy-label'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'

interface ConfirmCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  confirmVariant?: 'default' | 'destructive'
  confirmDisabled?: boolean
  pending?: boolean
  pendingLabel?: string
  cancelLabel?: string
  errorMessage?: string | null
  children?: ReactNode
}

export function ConfirmCredenza({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmVariant = 'default',
  confirmDisabled = false,
  pending = false,
  pendingLabel,
  cancelLabel = 'Cancel',
  errorMessage = null,
  children,
}: ConfirmCredenzaProps) {
  const hasBody = Boolean(children) || Boolean(errorMessage)

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{title}</CredenzaTitle>
          <CredenzaDescription>{description}</CredenzaDescription>
        </CredenzaHeader>
        {hasBody && (
          <CredenzaBody className="flex flex-col gap-3">
            {children}
            <ErrorAlert message={errorMessage} />
          </CredenzaBody>
        )}
        <CredenzaFooter>
          <CredenzaClose
            render={<Button variant="outline" disabled={pending} />}
          >
            {cancelLabel}
          </CredenzaClose>
          <Button
            variant={confirmVariant}
            disabled={confirmDisabled || pending}
            onClick={onConfirm}
          >
            <BusyLabel
              busy={pending}
              label={confirmLabel}
              busyLabel={pendingLabel}
            />
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
