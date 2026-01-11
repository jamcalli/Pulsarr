import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useApprovalToasts } from '@/hooks/useApprovalEvents'
import { useProgressStore } from '@/stores/progressStore'
import WindowedLayout from './window'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

/**
 * Renders the authenticated application layout, initializing progress tracking and global approval toast notifications.
 *
 * Wraps the provided content in the main windowed layout and manages setup and cleanup of progress state during the component lifecycle.
 * Version checking is handled by VersionDisplay component via React Query.
 *
 * @param children - The content to display within the authenticated layout
 */
export default function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  const initialize = useProgressStore((state) => state.initialize)
  const cleanup = useProgressStore((state) => state.cleanup)
  const initialized = useRef(false)

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
