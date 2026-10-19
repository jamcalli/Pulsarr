import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { ServerCardSkeleton } from '@/components/plex/server-card'
import { AccountCardSkeleton } from '@/features/system/components/plex-connection/account-card'
import { LibraryRefreshCardSkeleton } from '@/features/system/components/plex-connection/library-refresh-card'

export function PlexConnectionSkeleton() {
  return (
    <Page busy>
      <PageHeaderSkeleton />
      <AccountCardSkeleton />
      <ServerCardSkeleton />
      <LibraryRefreshCardSkeleton />
    </Page>
  )
}
