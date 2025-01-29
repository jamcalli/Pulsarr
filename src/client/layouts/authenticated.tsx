import type { ReactNode } from 'react'
import { ConfigProvider } from '@/context/context'
import WindowedLayout from './window'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <ConfigProvider>
      <WindowedLayout>
        {children}
      </WindowedLayout>
    </ConfigProvider>
  )
}