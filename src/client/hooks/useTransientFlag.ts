import { useEffect, useState } from 'react'

/** True for `ms` after `flag` turns true, so a completed action can show its result before the UI moves on. */
export function useTransientFlag(flag: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!flag) return
    setHeld(true)
    const timer = setTimeout(() => setHeld(false), ms)
    return () => clearTimeout(timer)
  }, [flag, ms])

  return held
}
