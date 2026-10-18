import { NavPageButton } from '@/components/nav-page-button'
import { RouteNotice } from '@/components/route-notice'
import { NAV_PAGES } from '@/lib/navigation'

export default function NotFoundPage() {
  return (
    <RouteNotice
      title="Page not found"
      description="Nothing lives at this address. It may have moved or never existed."
    >
      <NavPageButton page={NAV_PAGES.dashboard} />
    </RouteNotice>
  )
}
