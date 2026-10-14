import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { UserIdentityCardSkeleton } from '@/features/users/components/user/user-identity-card'
import { UserQuotasSectionSkeleton } from '@/features/users/components/user/user-quotas-section'
import { UserSettingsSectionsSkeleton } from '@/features/users/components/user/user-settings-sections'
import { UserStatsRowSkeleton } from '@/features/users/components/user/user-stats-row'
import { UserWatchlistSectionSkeleton } from '@/features/users/components/user/user-watchlist-section'

export function UserPageSkeleton() {
  return (
    <Page>
      <div aria-busy="true" className="flex flex-col gap-5">
        <PageHeaderSkeleton />
        <UserIdentityCardSkeleton />
        <UserStatsRowSkeleton />
        <UserSettingsSectionsSkeleton />
        <UserQuotasSectionSkeleton />
        <UserWatchlistSectionSkeleton />
      </div>
    </Page>
  )
}
