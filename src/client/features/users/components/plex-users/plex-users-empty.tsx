import { Users } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { InlineLink } from '@/components/inline-link'
import { NoMatchesEmpty } from '@/components/no-matches-empty'
import type { PlexUsersPage } from '@/features/users/hooks/plex-users/usePlexUsersPage'
import { NAV_PAGES, pageHref } from '@/lib/navigation'

export function PlexNotConnectedEmpty() {
  return (
    <EmptyState
      icon={<Users />}
      title="Plex isn't connected"
      description="Connect Plex to see your Plex friends here."
    >
      <InlineLink to={pageHref(NAV_PAGES.plexConnection)}>
        Open Plex connection
      </InlineLink>
    </EmptyState>
  )
}

export function PlexUsersNoResults({ page }: { page: PlexUsersPage }) {
  return (
    <NoMatchesEmpty
      title="No users match these filters"
      description="Try another search, or clear the filters to see everyone."
      onClear={page.clearFilters}
    />
  )
}
