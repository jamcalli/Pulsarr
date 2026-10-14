import { type ComponentType, type ReactNode, useEffect } from 'react'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { Form } from '@/components/form/form'

interface BulkForm {
  AppForm: ComponentType<{ children?: ReactNode }>
  reset: () => void
}

interface BulkFormCredenzaProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Reset to its defaults each time the credenza opens. */
  form: BulkForm
  title: string
  description: string
  footer: ReactNode
  children: ReactNode
}

export function BulkFormCredenza({
  open,
  onOpenChange,
  form,
  title,
  description,
  footer,
  children,
}: BulkFormCredenzaProps) {
  useEffect(() => {
    if (open) form.reset()
  }, [open, form])

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="md:max-w-xl">
        <CredenzaHeader>
          <CredenzaTitle>{title}</CredenzaTitle>
          <CredenzaDescription>{description}</CredenzaDescription>
        </CredenzaHeader>
        <form.AppForm>
          <Form className="contents">
            <CredenzaBody className="flex flex-col gap-6">
              {children}
            </CredenzaBody>
            <CredenzaFooter className="sm:flex-col">{footer}</CredenzaFooter>
          </Form>
        </form.AppForm>
      </CredenzaContent>
    </Credenza>
  )
}
