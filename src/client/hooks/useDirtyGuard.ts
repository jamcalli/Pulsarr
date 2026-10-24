import { useState } from 'react'

/** Holds an action for confirmation while the guarded content reports itself dirty. */
export function useDirtyGuard() {
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)

  return {
    dirty,
    setDirty,
    run: (action: () => void) => {
      if (dirty) setPending(() => action)
      else action()
    },
    leaveDialog: {
      open: pending !== null,
      onStay: () => setPending(null),
      onLeave: () => {
        const action = pending
        setPending(null)
        setDirty(false)
        action?.()
      },
    },
  }
}
