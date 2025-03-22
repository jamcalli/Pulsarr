import { useEffect } from 'react'
import type { ReactNode } from 'react'
import WindowedLayout from './window'
import { useProgressStore } from '@/stores/progressStore'
import { useVersionCheck } from '@/hooks/useVersionCheck'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export default function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  const initialize = useProgressStore((state) => state.initialize)
  const cleanup = useProgressStore((state) => state.cleanup)

  useVersionCheck('jamcalli', 'Pulsarr')

  useEffect(() => {
    initialize()
    return () => {
      cleanup()
    }
  }, [initialize, cleanup])

  return <WindowedLayout>{children}</WindowedLayout>
}
