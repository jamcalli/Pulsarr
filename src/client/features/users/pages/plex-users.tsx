import { DataTableFooter } from '@/components/data-table/data-table-footer'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { BulkQuotaCredenza } from '@/features/users/components/plex-users/bulk-quota-credenza'
import { BulkSettingsCredenza } from '@/features/users/components/plex-users/bulk-settings-credenza'
import { NotYetFriendsCard } from '@/features/users/components/plex-users/not-yet-friends-card'
import { PlexUsersBar } from '@/features/users/components/plex-users/plex-users-bar'
import {
  PlexNotConnectedEmpty,
  PlexUsersNoResults,
} from '@/features/users/components/plex-users/plex-users-empty'
import { PlexUsersFilters } from '@/features/users/components/plex-users/plex-users-filters'
import {
  PlexUsersBodySkeleton,
  PlexUsersSkeleton,
} from '@/features/users/components/plex-users/plex-users-skeleton'
import { PlexUsersTable } from '@/features/users/components/plex-users/plex-users-table'
import {
  type PlexUsersPage as UsersPage,
  usePlexUsersPage,
} from '@/features/users/hooks/plex-users/usePlexUsersPage'
import { NAV_PAGES } from '@/lib/navigation'

const SECTION = 'Users'
const TITLE = NAV_PAGES.plexUsers.label
const DESCRIPTION =
  'Set sync, approval, notifications and quotas for each person.'

function UsersBody({ page }: { page: UsersPage }) {
  const { rows } = page

  if (page.isLoading) return <PlexUsersBodySkeleton />
  if (rows === null) return null

  return (
    <div className="flex flex-col gap-5">
      <PlexUsersFilters page={page} />
      {rows.length === 0 ? (
        <PlexUsersNoResults page={page} />
      ) : (
        <PlexUsersTable page={page} rows={rows} />
      )}
      <DataTableFooter
        page={page.page}
        pageSize={page.pageSize}
        onPageSizeChange={page.setPageSize}
        total={page.total}
        pageHref={page.pageHref}
        onPageChange={page.setPage}
      />
      <NotYetFriendsCard accounts={page.untracked} />
    </div>
  )
}

export default function PlexUsersPage() {
  const page = usePlexUsersPage()
  const header = (
    <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
  )

  if (!page.isReady) {
    return <PlexUsersSkeleton />
  }

  if (!page.plexConnected) {
    return (
      <Page wide>
        {header}
        <PlexNotConnectedEmpty />
      </Page>
    )
  }

  if (page.errorMessage) {
    return (
      <Page wide>
        {header}
        <RetryAlert message={page.errorMessage} onRetry={page.retry} />
      </Page>
    )
  }

  return (
    <Page wide>
      {header}
      <UsersBody page={page} />
      <PlexUsersBar page={page} />
      <BulkSettingsCredenza page={page} />
      <BulkQuotaCredenza page={page} />
    </Page>
  )
}
