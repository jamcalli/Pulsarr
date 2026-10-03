import { Link } from 'react-router-dom'
import { Page, PageHeader } from '@/components/page-header'
import { NAV_PAGES } from '@/lib/navigation'

export default function HomePage() {
  return (
    <Page>
      <PageHeader title="Home" />
      <p className="text-muted">
        The new dashboard is not built yet. Open the{' '}
        <Link
          to={NAV_PAGES.dashboard.legacy[0]}
          className="text-foreground underline underline-offset-3 hover:no-underline"
        >
          current dashboard
        </Link>
        .
      </p>
    </Page>
  )
}
