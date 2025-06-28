import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import WindowedLayout from './window'
import { useProgressStore } from '@/stores/progressStore'
import { useVersionCheck } from '@/hooks/useVersionCheck'
import { useApprovalToasts } from '@/hooks/useApprovalEvents'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

/**
 * Renders the authenticated application layout, initializing progress tracking, version checks, and global approval toast notifications.
 *
 * Wraps the provided content in the main windowed layout and manages setup and cleanup of progress state during the component lifecycle.
 *
 * @param children - The content to display within the authenticated layout
 */
export default function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  const initialize = useProgressStore((state) => state.initialize)
  const cleanup = useProgressStore((state) => state.cleanup)
  const initialized = useRef(false)

  useVersionCheck('jamcalli', 'Pulsarr')

  // Enable global approval toast notifications throughout authenticated app
  useApprovalToasts()

  useEffect(() => {
    if (!initialized.current) {
      initialize()
      initialized.current = true
    }

    return () => {
      cleanup()
      initialized.current = false
    }
  }, [initialize, cleanup])

  return <WindowedLayout>{children}</WindowedLayout>
}
