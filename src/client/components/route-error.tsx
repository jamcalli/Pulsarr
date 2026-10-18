import { useRouteError } from 'react-router-dom'
import { NavPageButton } from '@/components/nav-page-button'
import { RouteNotice } from '@/components/route-notice'
import { Button } from '@/components/ui/button'
import { NAV_PAGES } from '@/lib/navigation'
import { apiErrorMessage } from '@/lib/tanstackApi'

export function RouteError() {
  const error = useRouteError()
  const message = apiErrorMessage(error) ?? 'The page failed to render.'

  return (
    <RouteNotice
      title="Something went wrong"
      description={
        <span className="font-mono text-xs break-words">{message}</span>
      }
    >
      <Button size="sm" onClick={() => window.location.reload()}>
        Reload
      </Button>
      <NavPageButton page={NAV_PAGES.dashboard} />
    </RouteNotice>
  )
}
