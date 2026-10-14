import { Film, Tv } from 'lucide-react'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { ColorSwatch } from '@/components/color-swatch'
import { StackedBar } from '@/components/stacked-bar'
import { StatTile, StatTileSkeleton } from '@/components/stat-tile'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChartColor } from '@/lib/chart-colors'
import { formatCount, formatNumber, formatPercent } from '@/lib/format'
import type { components } from '@/types/api.js'

type InstanceBreakdown = components['schemas']['InstanceBreakdown']
type StatusDistribution = components['schemas']['StatusDistribution']

const STAGE_GRID = 'grid gap-4 sm:grid-cols-3'
const INSTANCE_ROW =
  'grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3'

const SKELETON_INSTANCES = ['a', 'b']

const STAGES = [
  {
    status: 'requested',
    label: 'Requested',
    color: 'chart-requested',
    description: 'In Radarr or Sonarr, no file yet',
  },
  {
    status: 'grabbed',
    label: 'Grabbed',
    color: 'chart-grabbed',
    description: 'Downloaded, no notification sent',
  },
  {
    status: 'notified',
    label: 'Notified',
    color: 'chart-notified',
    description: 'Ready, and the user was told',
  },
] as const satisfies ReadonlyArray<{
  status: string
  label: string
  color: ChartColor
  description: string
}>

function itemSegments(statuses: StatusDistribution[]) {
  return STAGES.map((stage) => ({
    ...stage,
    value: statuses.find((row) => row.status === stage.status)?.count ?? 0,
  }))
}

function instanceSegments(instance: InstanceBreakdown) {
  return STAGES.map((stage) => ({
    ...stage,
    value: instance.by_status
      .filter((row) => row.status === stage.status)
      .reduce((sum, row) => sum + row.count, 0),
  }))
}

function sumOf(segments: Array<{ value: number }>): number {
  return segments.reduce((sum, segment) => sum + segment.value, 0)
}

export function PipelineCard({
  statuses,
  instances = [],
}: {
  statuses: StatusDistribution[]
  instances?: InstanceBreakdown[]
}) {
  const segments = itemSegments(statuses)
  const total = sumOf(segments)
  const rows = instances.map((instance) => {
    const placements = instanceSegments(instance)
    return { instance, segments: placements, total: sumOf(placements) }
  })

  const content =
    total === 0 ? (
      <p className="text-muted-foreground">No requests routed in this range.</p>
    ) : (
      <>
        <div className={STAGE_GRID}>
          {segments.map((stage) => (
            <StatTile
              key={stage.status}
              label={
                <>
                  <ColorSwatch color={stage.color} />
                  {stage.label}
                </>
              }
              value={formatNumber(stage.value)}
              detail={formatPercent(stage.value / total)}
              description={stage.description}
            />
          ))}
        </div>
        <StackedBar segments={segments} showLegend={false} />
        <div className="flex flex-col gap-3">
          <span className="font-medium">Placements by instance</span>
          {rows.map(({ instance, segments: rowSegments, total }) => {
            const Icon = instance.type === 'radarr' ? Film : Tv
            return (
              <div
                key={`${instance.type}-${instance.id}`}
                className={INSTANCE_ROW}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{instance.name}</span>
                </span>
                <StackedBar
                  segments={rowSegments}
                  showLabels={false}
                  showLegend={false}
                />
                <span className="text-right tabular-nums">
                  {formatNumber(total)}
                </span>
              </div>
            )
          })}
        </div>
      </>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request pipeline</CardTitle>
        {total > 0 && (
          <CardAction className="text-muted-foreground">
            {formatCount(total, 'request')}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="gap-5">{content}</CardContent>
    </Card>
  )
}

export function PipelineCardSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton action={<Skeleton className="h-4 w-20" />} />
      <CardContent className="gap-5">
        <div className={STAGE_GRID}>
          {STAGES.map((stage) => (
            <StatTileSkeleton key={stage.status} />
          ))}
        </div>
        <Skeleton className="h-5 w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-44" />
          {SKELETON_INSTANCES.map((key) => (
            <div key={key} className={INSTANCE_ROW}>
              <Skeleton className="h-4 w-28 max-w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
