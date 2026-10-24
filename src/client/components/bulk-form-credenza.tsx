import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useEffect,
} from 'react'
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
import { Form } from '@/components/form/form'
import { LeaveDialog } from '@/components/leave-dialog'
import { SaveBar } from '@/components/settings/save-bar'
import { Button } from '@/components/ui/button'
import { useGuardedClose } from '@/hooks/useGuardedClose'

interface BulkForm {
  AppForm: ComponentType<{ children?: ReactNode }>
  reset: () => void
}

type CredenzaSaveBar = Pick<
  ComponentProps<typeof SaveBar>,
  'saveLabel' | 'saveDisabled' | 'message'
> & { errorMessage?: string | null }

interface BulkFormCredenzaBaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Reset to its defaults each time the credenza opens. */
  form: BulkForm
  title: string
  description: string
  /** Closing asks before discarding while true. */
  dirty?: boolean
  /** Closing does nothing while true. */
  busy?: boolean
  children: ReactNode
}

type BulkFormCredenzaProps = BulkFormCredenzaBaseProps &
  (
    | {
        /** Shown while dirty or busy, with Cancel as the guarded discard, and a plain Cancel otherwise. */
        saveBar: CredenzaSaveBar
        footer?: never
      }
    | {
        /** Receives the guarded close, for a footer that does not fit `saveBar`. */
        footer: (close: () => void) => ReactNode
        saveBar?: never
      }
  )

export function BulkFormCredenza({
  open,
  onOpenChange,
  form,
  title,
  description,
  dirty = false,
  busy = false,
  saveBar,
  footer,
  children,
}: BulkFormCredenzaProps) {
  const guard = useGuardedClose(onOpenChange)
  const { setDirty } = guard

  useEffect(() => {
    if (open) form.reset()
  }, [open, form])

  useEffect(() => {
    setDirty(dirty)
  }, [dirty, setDirty])

  const changeOpen = (next: boolean) => {
    if (!next && busy) return
    guard.onOpenChange(next)
  }
  const close = () => changeOpen(false)

  const saveFooter = (bar: CredenzaSaveBar) =>
    dirty || busy ? (
      <SaveBar
        dirty
        isSubmitting={busy}
        saved={false}
        errorMessage={bar.errorMessage ?? null}
        onDiscard={close}
        message={bar.message}
        saveLabel={bar.saveLabel}
        saveDisabled={bar.saveDisabled}
        discardLabel="Cancel"
      />
    ) : (
      <CredenzaClose
        render={
          <Button type="button" variant="outline" className="sm:self-end" />
        }
      >
        Cancel
      </CredenzaClose>
    )

  return (
    <>
      <Credenza open={open} onOpenChange={changeOpen}>
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
              <CredenzaFooter className="sm:flex-col">
                {saveBar ? saveFooter(saveBar) : footer(close)}
              </CredenzaFooter>
            </Form>
          </form.AppForm>
        </CredenzaContent>
      </Credenza>
      <LeaveDialog {...guard.leaveDialog} />
    </>
  )
}
