import { useEffect } from 'react'
import { useBreadcrumbStore } from '@/stores/breadcrumbStore'

/** Appends `tail` to the header breadcrumb while mounted, and nothing while it is null. */
export function useBreadcrumbTail(tail: string | null): void {
  const setTail = useBreadcrumbStore((state) => state.setTail)

  useEffect(() => {
    setTail(tail)
    return () => setTail(null)
  }, [setTail, tail])
}
