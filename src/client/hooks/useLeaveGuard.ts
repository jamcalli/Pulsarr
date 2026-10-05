import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

/** Blocks in-app navigation and warns on tab close while `dirty`. */
export function useLeaveGuard(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return {
    blocked: blocker.state === 'blocked',
    proceed: () => blocker.proceed?.(),
    reset: () => blocker.reset?.(),
  }
}
