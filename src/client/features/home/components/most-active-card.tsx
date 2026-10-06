import { ChartLegend } from '@/components/chart-legend'
import { ErrorAlert } from '@/components/error-alert'
import { StackedBar } from '@/components/stacked-bar'
import { StatBarHeader } from '@/components/stat-bar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/user-avatar'
import {
  OverflowList,
  OverflowSummarySkeleton,
} from '@/features/home/components/overflow-list'
import type { TopUsers } from '@/features/home/hooks/useTopUsers'
import { rangeLabel } from '@/features/home/lib/range-label'
import { VISIBLE_ROWS } from '@/features/home/lib/ranked-rows'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { formatCount } from '@/lib/format'
import type { components } from '@/types/api.js'

type UserStat = components['schemas']['UserStat']

const MOVIES = { label: 'Movies', color: 'chart-movie' } as const
const SHOWS = { label: 'Shows', color: 'chart-show' } as const

const SKELETON_ROWS = Array.from(
  { length: VISIBLE_ROWS },
  (_, row) => `row-${row}`,
)

function MostActiveSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-4">
        {SKELETON_ROWS.map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </span>
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-14" />
      </div>
      <OverflowSummarySkeleton />
    </>
  )
}

function UserRows({
  users,
  topCount,
}: {
  users: UserStat[]
  topCount: number
}) {
  const lookup = useUserDirectory()

  return (
    <>
      <div className="flex flex-col gap-4">
        {users.map((user) => {
          const person = lookup(user.name)
          return (
            <div key={user.name} className="flex flex-col gap-1.5">
              <StatBarHeader
                label={person.name}
                valueText={formatCount(user.count, 'item')}
                icon={
                  <UserAvatar
                    name={person.name}
                    avatar={person.avatar}
                    size="sm"
                  />
                }
              />
              <StackedBar
                segments={[
                  { ...MOVIES, value: user.movies },
                  { ...SHOWS, value: user.shows },
                ]}
                total={topCount}
                showLabels={false}
                showLegend={false}
              />
            </div>
          )
        })}
      </div>
      <ChartLegend items={[MOVIES, SHOWS]} />
    </>
  )
}

function hiddenUsersSummary(hidden: UserStat[]): string {
  const items = hidden.reduce((sum, user) => sum + user.count, 0)
  return `+${formatCount(hidden.length, 'more user')}, ${formatCount(items, 'item')}`
}

export function MostActiveCard({ topUsers }: { topUsers: TopUsers }) {
  const users = topUsers.data
  const topCount = Math.max(0, ...(users ?? []).map((user) => user.count))
  const range = rangeLabel(topUsers.days)

  const content = topUsers.errorMessage ? (
    <ErrorAlert message={topUsers.errorMessage} />
  ) : topUsers.isLoading ? (
    <MostActiveSkeleton />
  ) : users === undefined ? null : users.length === 0 ? (
    <p className="text-muted-foreground">No activity in this range.</p>
  ) : (
    <OverflowList
      rows={users}
      summary={hiddenUsersSummary}
      title="Most active"
      description={range}
      renderRows={(rows) => <UserRows users={rows} topCount={topCount} />}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most active</CardTitle>
        <CardDescription>{range}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 gap-4">{content}</CardContent>
    </Card>
  )
}
