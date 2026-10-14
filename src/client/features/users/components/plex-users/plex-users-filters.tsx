import { FilterToolbar } from '@/components/filter-toolbar'
import type { PlexUsersPage } from '@/features/users/hooks/plex-users/usePlexUsersPage'
import {
  APPROVAL_FILTER_OPTIONS,
  SYNC_FILTER_OPTIONS,
  USERS_FILTER_WIDTHS,
} from '@/features/users/lib/plex-users/users-state'
import { RELATIONSHIP_FILTER_OPTIONS } from '@/features/users/lib/relationship'
import { toolbarFilter } from '@/lib/filter-toolbar'

export function PlexUsersFilters({ page }: { page: PlexUsersPage }) {
  const { state } = page
  const filters = [
    toolbarFilter({
      label: 'Relationship',
      value: state.rel,
      options: RELATIONSHIP_FILTER_OPTIONS,
      onValueChange: (rel) => page.update({ rel }),
      width: USERS_FILTER_WIDTHS.rel,
    }),
    toolbarFilter({
      label: 'Sync',
      value: state.sync,
      options: SYNC_FILTER_OPTIONS,
      onValueChange: (sync) => page.update({ sync }),
      width: USERS_FILTER_WIDTHS.sync,
    }),
    toolbarFilter({
      label: 'Approval',
      value: state.appr,
      options: APPROVAL_FILTER_OPTIONS,
      onValueChange: (appr) => page.update({ appr }),
      width: USERS_FILTER_WIDTHS.appr,
    }),
  ]

  return (
    <FilterToolbar
      search={{
        label: 'Search users',
        value: state.q,
        onValueChange: (q) => page.update({ q }),
      }}
      filters={filters}
      filterCount={page.filterCount}
      filtered={page.filtered}
      onClear={page.clearFilters}
      total={page.total}
      noun="user"
    />
  )
}
