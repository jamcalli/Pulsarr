import { cn } from 'cn'
import { ChartLegend } from '@/components/chart-legend'
import { ChartTooltip } from '@/components/chart-tooltip'
import { CHART_FILL, type ChartColor } from '@/lib/chart-colors'
import { formatNumber, formatPercent } from '@/lib/format'

export interface StackedBarSegment {
  label: string
  value: number
  color: ChartColor
}

interface StackedBarProps {
  segments: StackedBarSegment[]
  /** Sets the bar length (default the segments' sum), while percents stay each segment's share of that sum. */
  total?: number
  showLabels?: boolean
  showLegend?: boolean
}

const MIN_LABEL_SHARE = 0.08

export function StackedBar({
  segments,
  total,
  showLabels = true,
  showLegend = true,
}: StackedBarProps) {
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0)
  const length = total ?? sum
  const visible = segments.filter((segment) => segment.value > 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="group/bar flex h-5 overflow-hidden rounded-r-sm bg-chart-track">
        {length > 0 &&
          visible.map((segment, index) => {
            const share = segment.value / sum
            return (
              <ChartTooltip
                key={segment.label}
                label={segment.label}
                value={formatNumber(segment.value)}
                detail={formatPercent(share)}
                color={segment.color}
                render={
                  <button
                    type="button"
                    data-slot="stacked-bar-segment"
                    aria-label={`${segment.label}: ${formatNumber(segment.value)}`}
                    className={cn(
                      'flex h-full min-w-2 items-center justify-center overflow-hidden border-2 border-border text-xs font-bold text-chart-ink tabular-nums outline-foreground/50 transition-opacity pointer-fine:group-hover/bar:opacity-60 group-has-focus-visible/bar:opacity-60 pointer-fine:hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-3 focus-visible:-outline-offset-2',
                      index > 0 && 'border-l-0',
                      index === visible.length - 1 && 'rounded-r-sm',
                      CHART_FILL[segment.color],
                    )}
                    style={{ width: `${(segment.value / length) * 100}%` }}
                  >
                    {showLabels &&
                      share >= MIN_LABEL_SHARE &&
                      formatPercent(share)}
                  </button>
                }
              />
            )
          })}
      </div>
      {showLegend && segments.length >= 2 && <ChartLegend items={segments} />}
    </div>
  )
}
