import type { ReactNode } from 'react'
import {
  LibraryMixCard,
  LibraryMixCardSkeleton,
} from '@/features/home/components/analytics/library-mix-card'
import {
  NotificationsCard,
  NotificationsCardSkeleton,
} from '@/features/home/components/analytics/notifications-card'
import {
  PipelineCard,
  PipelineCardSkeleton,
} from '@/features/home/components/analytics/pipeline-card'
import {
  RequestToReadyCard,
  RequestToReadyCardSkeleton,
} from '@/features/home/components/analytics/request-to-ready-card'
import {
  TopGenresCard,
  TopGenresCardSkeleton,
} from '@/features/home/components/analytics/top-genres-card'
import {
  ApprovalsCard,
  ApprovalsCardSkeleton,
} from '@/features/home/components/approvals-card'
import {
  MostActiveCard,
  MostActiveCardSkeleton,
} from '@/features/home/components/most-active-card'
import {
  PopularityRankings,
  PopularityRankingsCardSkeleton,
} from '@/features/home/components/popularity-rankings'
import {
  RecentRequests,
  RecentRequestsCardSkeleton,
} from '@/features/home/components/recent-requests'
import type {
  DashboardStats,
  DashboardStatsData,
} from '@/features/home/hooks/useDashboardStats'
import type { RecentRequestsState } from '@/features/home/hooks/useRecentRequests'
import type { TopGenres } from '@/features/home/hooks/useTopGenres'
import type { TopUsers } from '@/features/home/hooks/useTopUsers'
import {
  type HomeCardId,
  type HomeRow,
  normalizeRows,
} from '@/features/home/lib/home-layout'

export interface HomeCardContext {
  stats: DashboardStats
  recent: RecentRequestsState
  topUsers: TopUsers
  topGenres: TopGenres
}

export interface HomeCard {
  label: string
  render: (ctx: HomeCardContext) => ReactNode
  skeleton: () => ReactNode
  /** Whether the first fetches this card needs have settled. */
  isReady: (ctx: HomeCardContext) => boolean
  /** Drawn from dashboard stats, so a stats failure drops it for the page's single stats alert. */
  needsStats?: true
}

function statsCard(
  stats: DashboardStats,
  skeleton: ReactNode,
  render: (data: DashboardStatsData) => ReactNode,
): ReactNode {
  if (stats.isLoading || stats.data === undefined) return skeleton
  return render(stats.data)
}

export const HOME_CARDS: Record<HomeCardId, HomeCard> = {
  approvals: {
    label: 'Needs your approval',
    render: () => <ApprovalsCard />,
    skeleton: () => <ApprovalsCardSkeleton />,
    isReady: () => true,
  },
  'most-active': {
    label: 'Most active',
    render: ({ topUsers }) => <MostActiveCard topUsers={topUsers} />,
    skeleton: () => <MostActiveCardSkeleton />,
    isReady: ({ topUsers }) => topUsers.isReady,
  },
  'recent-requests': {
    label: 'Recent requests',
    render: ({ recent }) => <RecentRequests recent={recent} />,
    skeleton: () => <RecentRequestsCardSkeleton />,
    isReady: ({ recent }) => recent.isReady,
  },
  'popularity-rankings': {
    needsStats: true,
    label: 'Popularity rankings',
    render: ({ stats, recent }) => (
      <PopularityRankings stats={stats} recentRequests={recent.items} />
    ),
    skeleton: () => <PopularityRankingsCardSkeleton />,
    isReady: ({ stats, recent }) => stats.isReady && recent.isReady,
  },
  pipeline: {
    needsStats: true,
    label: 'Request pipeline',
    render: ({ stats }) =>
      statsCard(stats, <PipelineCardSkeleton />, (data) => (
        <PipelineCard
          days={stats.days}
          statuses={data.status_distribution}
          instances={data.instance_content_breakdown}
        />
      )),
    skeleton: () => <PipelineCardSkeleton />,
    isReady: ({ stats }) => stats.isReady,
  },
  'request-to-ready': {
    needsStats: true,
    label: 'Request to ready',
    render: ({ stats }) =>
      statsCard(stats, <RequestToReadyCardSkeleton />, (data) => (
        <RequestToReadyCard
          days={stats.days}
          times={data.request_to_ready_times}
        />
      )),
    skeleton: () => <RequestToReadyCardSkeleton />,
    isReady: ({ stats }) => stats.isReady,
  },
  'top-genres': {
    label: 'Top genres',
    render: ({ topGenres }) => <TopGenresCard topGenres={topGenres} />,
    skeleton: () => <TopGenresCardSkeleton />,
    isReady: ({ topGenres }) => topGenres.isReady,
  },
  notifications: {
    needsStats: true,
    label: 'Notifications',
    render: ({ stats }) =>
      statsCard(stats, <NotificationsCardSkeleton />, (data) => (
        <NotificationsCard days={stats.days} stats={data.notification_stats} />
      )),
    skeleton: () => <NotificationsCardSkeleton />,
    isReady: ({ stats }) => stats.isReady,
  },
  'library-mix': {
    needsStats: true,
    label: 'Library mix',
    render: ({ stats }) =>
      statsCard(stats, <LibraryMixCardSkeleton />, (data) => (
        <LibraryMixCard distribution={data.content_type_distribution} />
      )),
    skeleton: () => <LibraryMixCardSkeleton />,
    isReady: ({ stats }) => stats.isReady,
  },
}

/** Drops stats cards and splits the rows at the first one, where the stats alert goes, or returns null when no row has one. */
export function splitAtStatsCards(
  rows: readonly HomeRow[],
): [HomeRow[], HomeRow[]] | null {
  const needsStats = (id: HomeCardId) => HOME_CARDS[id].needsStats === true
  const at = rows.findIndex((row) => row.cards.some(needsStats))
  if (at === -1) return null
  const strip = (part: readonly HomeRow[]) =>
    normalizeRows(part.map((row) => row.cards.filter((id) => !needsStats(id))))
  return [strip(rows.slice(0, at)), strip(rows.slice(at))]
}
