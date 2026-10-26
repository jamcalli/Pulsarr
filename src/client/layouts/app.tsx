import { type ReactNode, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useApprovalToasts } from '@/hooks/useApprovalToasts'
import { useProgressConnection } from '@/hooks/useProgressConnection'
import { useScrollReset } from '@/hooks/useScrollReset'
import { useSessionExpiryRedirect } from '@/hooks/useSessionExpiryRedirect'

export default function AppLayout({ children }: { children?: ReactNode }) {
  useProgressConnection()
  useApprovalToasts()
  useSessionExpiryRedirect()
  const inset = useRef<HTMLElement>(null)
  useScrollReset(inset)

  return (
    <SidebarProvider className="bg-inset">
      <AppSidebar />
      <SidebarInset ref={inset} className="min-w-0 overflow-x-clip bg-inset">
        <AppHeader />
        <Outlet />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
