import { Film, Tv } from 'lucide-react'
import { ColorSwatch } from '@/components/color-swatch'
import { StackedBar } from '@/components/stacked-bar'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ChartColor } from '@/lib/chart-colors'
import { formatCount, formatNumber, formatPercent } from '@/lib/format'
import type { components } from '@/types/api.js'

type InstanceBreakdown = components['schemas']['InstanceBreakdown']

const STAGES = [
  {
    status: 'requested',
    label: 'Requested',
    color: 'chart-requested',
    description: 'Sent to Radarr or Sonarr, not grabbed yet',
  },
  {
    status: 'grabbed',
    label: 'Grabbed',
    color: 'chart-grabbed',
    description: 'Downloading now',
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

function stageSegments(instances: InstanceBreakdown[]) {
  return STAGES.map((stage) => ({
    ...stage,
    value: instances
      .flatMap((instance) => instance.by_status)
      .filter((row) => row.status === stage.status)
      .reduce((sum, row) => sum + row.count, 0),
  }))
}

function sumOf(segments: Array<{ value: number }>): number {
  return segments.reduce((sum, segment) => sum + segment.value, 0)
}

export function PipelineCard({
  instances = [],
}: {
  instances?: InstanceBreakdown[]
}) {
  const segments = stageSegments(instances)
  const total = sumOf(segments)
  const rows = instances.map((instance) => {
    const instanceSegments = stageSegments([instance])
    return {
      instance,
      segments: instanceSegments,
      total: sumOf(instanceSegments),
    }
  })

  const content =
    total === 0 ? (
      <p className="text-muted-foreground">No requests routed in this range.</p>
    ) : (
      <>
        <div className="grid gap-4 sm:grid-cols-3">
          {segments.map((stage) => (
            <div key={stage.status} className="flex flex-col gap-1">
              <span className="flex items-center gap-2 font-medium">
                <ColorSwatch color={stage.color} />
                {stage.label}
              </span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="font-heading text-2xl font-bold">
                  {formatNumber(stage.value)}
                </span>
                <span className="text-muted-foreground">
                  {formatPercent(stage.value / total)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {stage.description}
              </span>
            </div>
          ))}
        </div>
        <StackedBar segments={segments} showLegend={false} />
        <div className="flex flex-col gap-3">
          <span className="font-medium">By instance</span>
          {rows.map(({ instance, segments: instanceSegments, total }) => {
            const Icon = instance.type === 'radarr' ? Film : Tv
            return (
              <div
                key={`${instance.type}-${instance.id}`}
                className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{instance.name}</span>
                </span>
                <StackedBar
                  segments={instanceSegments}
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
