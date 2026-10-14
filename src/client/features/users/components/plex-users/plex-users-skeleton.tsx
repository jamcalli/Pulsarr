import type { ReactNode } from 'react'
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton'
import { FilterToolbarSkeleton } from '@/components/filter-toolbar'
import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatarSkeleton } from '@/components/user-avatar'
import { NotYetFriendsCardSkeleton } from '@/features/users/components/plex-users/not-yet-friends-card'
import {
  USERS_COLUMN_CLASSES,
  USERS_COLUMNS,
} from '@/features/users/components/plex-users/plex-users-columns'
import { USERS_FILTER_WIDTHS } from '@/features/users/lib/plex-users/users-state'

const NAME_WIDTHS = ['w-28', 'w-36', 'w-24', 'w-32', 'w-40', 'w-30'] as const

function cellSkeleton(id: string, nameWidth: string): ReactNode {
  switch (id) {
    case 'user':
      return (
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatarSkeleton />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className={`h-4 ${nameWidth} max-w-full`} />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      )
    case 'relationship':
      return <Skeleton className="h-6 w-18" />
    case 'notifications':
      return <Skeleton className="h-4 w-28" />
    case 'quotas':
      return (
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-36" />
        </div>
      )
    default:
      return <Skeleton className="h-4 w-8" />
  }
}

export function PlexUsersBodySkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <FilterToolbarSkeleton widths={USERS_FILTER_WIDTHS} />
      <DataTableSkeleton
        columns={USERS_COLUMNS}
        columnClasses={USERS_COLUMN_CLASSES}
        rows={NAME_WIDTHS}
        cell={cellSkeleton}
      />
      <NotYetFriendsCardSkeleton />
    </div>
  )
}

export function PlexUsersSkeleton() {
  return (
    <Page wide>
      <PageHeaderSkeleton />
      <PlexUsersBodySkeleton />
    </Page>
  )
}
