import { ConfirmCredenza } from '@/components/confirm-credenza'

interface LeaveDialogProps {
  open: boolean
  onStay: () => void
  onLeave: () => void
}

export function LeaveDialog({ open, onStay, onLeave }: LeaveDialogProps) {
  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay()
      }}
      title="Leave without saving?"
      description="Your changes will be lost."
      confirmLabel="Leave"
      confirmVariant="destructive"
      cancelLabel="Stay"
      onConfirm={onLeave}
    />
  )
}
