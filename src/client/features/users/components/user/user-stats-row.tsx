import { ContentTypeSchema } from '@root/schemas/common/content-type.schema'
import { InlineLink } from '@/components/inline-link'
import { QuotaLimitPill } from '@/components/quota/quota-limit-pill'
import { StackedBar, StackedBarSkeleton } from '@/components/stacked-bar'
import { StatTile, StatTileSkeleton } from '@/components/stat-tile'
import { Card, CardContent } from '@/components/ui/card'
import type { UserPageData } from '@/features/users/hooks/user/useUserPage'
import { CONTENT_TYPE_LABELS } from '@/lib/content-type'
import { formatNumber } from '@/lib/format'
import { approvalQueueHref } from '@/lib/navigation'
import { formatQuotaUsage, quotaWindowLabel } from '@/lib/quota'
import {
  REQUEST_STATUS_COLORS,
  REQUEST_STATUS_LABELS,
  ROUTED_STATUSES,
} from '@/lib/request-labels'
import type { components } from '@/types/api.js'

type WatchlistCounts = components['schemas']['UserStats']['watchlist']

const STATS_GRID = 'grid grid-cols-2 gap-5 md:grid-cols-6'

const REQUESTS_SPAN: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
}

const PHONE_ORDER = {
  watchlist: 'max-md:order-1',
  notifications: 'max-md:order-2',
  requests: 'col-span-2 max-md:order-3',
  quota: 'max-md:order-4',
  approvals: 'max-md:order-5',
} as const

function RequestsTile({
  counts,
  span,
}: {
  counts: WatchlistCounts
  span: number
}) {
  const segments = ROUTED_STATUSES.map((status) => ({
    label: REQUEST_STATUS_LABELS[status],
    value: counts[status],
    color: REQUEST_STATUS_COLORS[status],
  }))
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const className = `${PHONE_ORDER.requests} ${REQUESTS_SPAN[span]}`
  const pending =
    counts.pending > 0
      ? `${formatNumber(counts.pending)} ${REQUEST_STATUS_LABELS.pending.toLowerCase()}`
      : undefined

  if (total === 0) {
    return (
      <StatTile
        label="Requests by status"
        value={formatNumber(0)}
        description={pending ?? 'No requests yet'}
        className={className}
      />
    )
  }
  return (
    <StatTile
      label="Requests by status"
      description={pending}
      className={className}
    >
      <StackedBar segments={segments} showLabels={false} />
    </StatTile>
  )
}

export function UserStatsRow({ data }: { data: UserPageData }) {
  const { stats, statuses, quotaSettings } = data
  const quotaTiles = ContentTypeSchema.options.flatMap((type) => {
    const status = statuses[type]
    return status ? [{ type, status }] : []
  })
  const quotaTileCount = Math.max(quotaTiles.length, 1)

  return (
    <Card>
      <CardContent className={STATS_GRID}>
        <StatTile
          label="On watchlist"
          value={formatNumber(stats.watchlist.total)}
          className={PHONE_ORDER.watchlist}
        />
        <RequestsTile counts={stats.watchlist} span={3 - quotaTileCount} />
        {quotaTiles.length === 0 ? (
          <StatTile
            label="Quota usage"
            value="No quotas"
            className={PHONE_ORDER.quota}
          />
        ) : (
          quotaTiles.map(({ type, status }) => (
            <StatTile
              key={type}
              label={`${CONTENT_TYPE_LABELS[type]} quota`}
              value={formatQuotaUsage(status.currentUsage, status.quotaLimit)}
              detail={status.exceeded && <QuotaLimitPill />}
              description={quotaWindowLabel(status.quotaType, quotaSettings)}
              className={PHONE_ORDER.quota}
            />
          ))
        )}
        <StatTile
          label="Notifications sent"
          value={formatNumber(stats.notificationsSent)}
          className={PHONE_ORDER.notifications}
        />
        <StatTile
          label={
            <InlineLink to={approvalQueueHref({ user: data.id })}>
              Pending approvals
            </InlineLink>
          }
          value={formatNumber(stats.pendingApprovals)}
          className={PHONE_ORDER.approvals}
        />
      </CardContent>
    </Card>
  )
}

export function UserStatsRowSkeleton() {
  return (
    <Card>
      <CardContent className={STATS_GRID}>
        <StatTileSkeleton className={PHONE_ORDER.watchlist} />
        <StatTileSkeleton
          className={`${PHONE_ORDER.requests} ${REQUESTS_SPAN[1]}`}
        >
          <StackedBarSkeleton legendItems={ROUTED_STATUSES.length} />
        </StatTileSkeleton>
        <StatTileSkeleton className={PHONE_ORDER.quota} />
        <StatTileSkeleton className={PHONE_ORDER.quota} />
        <StatTileSkeleton className={PHONE_ORDER.notifications} />
        <StatTileSkeleton className={PHONE_ORDER.approvals} />
      </CardContent>
    </Card>
  )
}
