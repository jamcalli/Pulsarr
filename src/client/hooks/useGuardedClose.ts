import { useState } from 'react'

/** Holds a close request for confirmation while the hosted content reports itself dirty. */
export function useGuardedClose(onOpenChange: (open: boolean) => void) {
  const [dirty, setDirty] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return {
    setDirty,
    onOpenChange: (open: boolean) => {
      if (!open && dirty) {
        setConfirming(true)
        return
      }
      onOpenChange(open)
    },
    leaveDialog: {
      open: confirming,
      onStay: () => setConfirming(false),
      onLeave: () => {
        setConfirming(false)
        setDirty(false)
        onOpenChange(false)
      },
    },
  }
}
