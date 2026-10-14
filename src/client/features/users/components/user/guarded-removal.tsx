import type { ReactNode } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { DeleteButton } from '@/components/delete-button'
import { LockLine } from '@/components/settings/lock-line'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'

interface GuardedRemovalProps {
  /** Unsaved edits lock the button, since removing would discard them. */
  dirty: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Runs before the confirm opens, to clear the last attempt. */
  onOpen: () => void
  label: string
  title: string
  description: string
  pending: boolean
  errorMessage: string | null
  onConfirm: () => void
  children?: ReactNode
}

export function GuardedRemoval({
  dirty,
  open,
  onOpenChange,
  onOpen,
  label,
  title,
  description,
  pending,
  errorMessage,
  onConfirm,
  children,
}: GuardedRemovalProps) {
  return (
    <>
      <div className="flex flex-col items-start gap-2 self-start">
        {dirty && <LockLine reason={UNSAVED_CHANGES_REASON} />}
        <DeleteButton
          size="sm"
          disabled={dirty}
          onClick={() => {
            onOpen()
            onOpenChange(true)
          }}
        >
          {label}
        </DeleteButton>
      </div>
      <ConfirmCredenza
        open={open}
        onOpenChange={(next) => {
          if (!pending) onOpenChange(next)
        }}
        title={title}
        description={description}
        confirmLabel={label}
        confirmVariant="destructive"
        pending={pending}
        pendingLabel="Removing..."
        errorMessage={errorMessage}
        onConfirm={onConfirm}
      >
        {children}
      </ConfirmCredenza>
    </>
  )
}
