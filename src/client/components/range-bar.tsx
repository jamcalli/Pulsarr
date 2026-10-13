import { cn } from 'cn'
import { ChartTooltip } from '@/components/chart-tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { CHART_FILL, type ChartColor } from '@/lib/chart-colors'
import { formatNumber } from '@/lib/format'

const ROW = 'flex flex-col gap-1.5'
const HEADER = 'flex items-baseline justify-between gap-3'
const TICKS = 'relative h-4 text-xs text-muted-foreground tabular-nums'
const SKELETON_TICKS = ['a', 'b', 'c', 'd']

interface RangeBarProps {
  label: string
  avg: number
  min: number
  max: number
  domainMax: number
  unit: string
  color: ChartColor
  detail?: string
}

function toPercent(value: number, domainMax: number): number {
  if (domainMax <= 0) return 0
  return Math.min(Math.max(value / domainMax, 0), 1) * 100
}

export function RangeBar({
  label,
  avg,
  min,
  max,
  domainMax,
  unit,
  color,
  detail,
}: RangeBarProps) {
  const start = toPercent(min, domainMax)
  const end = toPercent(max, domainMax)
  const mark = toPercent(avg, domainMax)

  return (
    <div className={ROW}>
      <div className={HEADER}>
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums">
          <span className="font-medium">{formatNumber(avg)}</span>{' '}
          <span className="text-muted-foreground">{unit}</span>
        </span>
      </div>
      <ChartTooltip
        label={label}
        value={`${formatNumber(avg)} ${unit} avg`}
        detail={`${formatNumber(min)} to ${formatNumber(max)} ${unit}`}
        color={color}
        trackCursorAxis="x"
        render={
          <button
            type="button"
            aria-label={`${label}: ${formatNumber(avg)} ${unit} avg, ${formatNumber(min)} to ${formatNumber(max)} ${unit}`}
            className="group/track relative block h-5 w-full rounded-sm bg-chart-track outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0"
          >
            <span
              data-slot="range-bar-span"
              className="absolute inset-y-0 overflow-hidden rounded-sm border-2 border-border"
              style={{
                left: `${start}%`,
                width: `${Math.max(end - start, 0)}%`,
              }}
            >
              <span
                className={cn(
                  'block size-full opacity-35 transition-opacity pointer-fine:group-hover/track:opacity-60 group-focus-visible/track:opacity-60',
                  CHART_FILL[color],
                )}
              />
            </span>
            <span
              data-slot="range-bar-average"
              className={cn('absolute -inset-y-1 w-0.5', CHART_FILL[color])}
              style={{ left: `calc(${mark}% - 1px)` }}
            />
          </button>
        }
      />
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

export function RangeBarTicks({
  ticks,
  domainMax,
}: {
  ticks: number[]
  domainMax: number
}) {
  return (
    <div className={TICKS}>
      {ticks.map((tick) => (
        <span
          key={tick}
          className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
          style={{ left: `${toPercent(tick, domainMax)}%` }}
        >
          {formatNumber(tick)}
        </span>
      ))}
    </div>
  )
}

export function RangeBarSkeleton() {
  return (
    <div className={ROW}>
      <div className={HEADER}>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-14" />
      </div>
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-3 w-56 max-w-full" />
    </div>
  )
}

export function RangeBarTicksSkeleton() {
  return (
    <div className={cn(TICKS, 'flex items-center justify-between')}>
      {SKELETON_TICKS.map((key) => (
        <Skeleton key={key} className="h-3 w-5" />
      ))}
    </div>
  )
}
