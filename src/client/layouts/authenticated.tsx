import type { ReactNode } from 'react'
import WindowedLayout from './window'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export default function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  return <WindowedLayout>{children}</WindowedLayout>
}
