import { ConfirmCredenza } from '@/components/confirm-credenza'
import { useLogout } from '@/hooks/useLogout'

interface LogOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogOutDialog({ open, onOpenChange }: LogOutDialogProps) {
  const logout = useLogout()

  const handleOpenChange = (next: boolean) => {
    if (!next) logout.reset()
    onOpenChange(next)
  }

  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={handleOpenChange}
      title="Log out?"
      description="Sync keeps running on the server. You'll need to sign in again to manage it."
      confirmLabel="Log out"
      onConfirm={() => logout.mutate({ body: {} })}
      pending={logout.isPending}
      pendingLabel="Logging out..."
      errorMessage={logout.errorMessage}
    />
  )
}
