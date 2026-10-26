import { useDirtyGuard } from '@/hooks/useDirtyGuard'

/** Holds a close request for confirmation while the hosted content reports itself dirty. */
export function useGuardedClose(onOpenChange: (open: boolean) => void) {
  const guard = useDirtyGuard()

  return {
    setDirty: guard.setDirty,
    onOpenChange: (open: boolean) => {
      if (open) onOpenChange(true)
      else guard.run(() => onOpenChange(false))
    },
    leaveDialog: guard.leaveDialog,
  }
}
