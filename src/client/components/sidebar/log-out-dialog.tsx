import { Loader2 } from 'lucide-react'
import { ErrorAlert } from '@/components/error-alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
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
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log out?</AlertDialogTitle>
          <AlertDialogDescription>
            Sync keeps running on the server. You'll need to sign in again to
            manage it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorAlert message={logout.errorMessage} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={logout.isPending}
            onClick={() => logout.mutate({ body: {} })}
          >
            {logout.isPending ? (
              <>
                <Loader2 className="animate-spin" data-icon="inline-start" />
                Logging out...
              </>
            ) : (
              'Log out'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
