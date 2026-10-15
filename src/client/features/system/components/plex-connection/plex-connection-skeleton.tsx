import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { AccountCardSkeleton } from '@/features/system/components/plex-connection/account-card'
import { LibraryRefreshCardSkeleton } from '@/features/system/components/plex-connection/library-refresh-card'
import { ServerCardSkeleton } from '@/features/system/components/plex-connection/server-card'

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
