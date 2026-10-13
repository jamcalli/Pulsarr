import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import {
  RangeBar,
  RangeBarSkeleton,
  RangeBarTicks,
  RangeBarTicksSkeleton,
} from '@/components/range-bar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type DurationUnit,
  durationScale,
  pickDurationUnit,
  roundDuration,
  toUnit,
  unitWord,
} from '@/features/home/lib/duration'
import type { ChartColor } from '@/lib/chart-colors'
import { formatCount, formatNumber } from '@/lib/format'
import type { components } from '@/types/api.js'

type ReadyTime = components['schemas']['RequestToReadyTime']

const CONTENT_TYPES = [
  { type: 'movie', label: 'Movies', color: 'chart-movie' },
  { type: 'show', label: 'Shows', color: 'chart-show' },
] as const satisfies ReadonlyArray<{
  type: string
  label: string
  color: ChartColor
}>

function duration(value: number, unit: DurationUnit): string {
  const rounded = roundDuration(value)
  return `${formatNumber(rounded)} ${unitWord(rounded, unit)}`
}

function comparison(
  rows: Array<{ label: string; avg: number }>,
  unit: DurationUnit,
): string | null {
  const [movies, shows] = rows
  if (rows.length !== 2 || !movies || !shows) return null
  const gap = roundDuration(Math.abs(movies.avg - shows.avg))
  const [faster, slower] =
    movies.avg <= shows.avg ? [movies, shows] : [shows, movies]
  return gap === 0
    ? 'Movies and shows are ready in about the same time.'
    : `${faster.label} are ready about ${duration(gap, unit)} sooner than ${slower.label.toLowerCase()}.`
}

export function RequestToReadyCard({ times }: { times: ReadyTime[] }) {
  const measured = CONTENT_TYPES.flatMap((contentType) => {
    const time = times.find(
      (row) => row.content_type === contentType.type && row.count > 0,
    )
    return time ? [{ ...contentType, time }] : []
  })

  const unit = pickDurationUnit(
    Math.max(0, ...measured.map(({ time }) => time.max_days)),
  )
  const rows = measured.map(({ time, ...contentType }) => ({
    ...contentType,
    count: time.count,
    avg: toUnit(time.avg_days, unit),
    min: toUnit(time.min_days, unit),
    max: toUnit(time.max_days, unit),
  }))
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0)
  const weightedAvg =
    totalCount > 0
      ? rows.reduce((sum, row) => sum + row.avg * row.count, 0) / totalCount
      : 0
  const headline = roundDuration(weightedAvg)
  const scale = durationScale(Math.max(0, ...rows.map((row) => row.max)))
  const sentence = comparison(rows, unit)
  const pending = times.reduce((sum, row) => sum + row.pending, 0)
  const waiting =
    pending === 1
      ? `${formatCount(pending, 'request')} is still waiting for a file.`
      : `${formatCount(pending, 'request')} are still waiting for a file.`

  const content =
    rows.length === 0 ? (
      <p className="text-muted-foreground">
        Nothing became ready in this range.{pending > 0 && ` ${waiting}`}
      </p>
    ) : (
      <>
        <p className="flex items-baseline gap-2 tabular-nums">
          <span className="font-heading text-3xl font-bold">
            {formatNumber(headline)}
          </span>
          <span className="text-muted-foreground">
            {unitWord(headline, unit)}
          </span>
        </p>
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <RangeBar
              key={row.type}
              label={row.label}
              avg={roundDuration(row.avg)}
              min={row.min}
              max={row.max}
              domainMax={scale.domainMax}
              unit={unitWord(roundDuration(row.avg), unit)}
              color={row.color}
              detail={`Average ${duration(row.avg, unit)}, ${formatNumber(roundDuration(row.min))} to ${duration(row.max, unit)}, ${formatCount(row.count, 'item')}`}
            />
          ))}
          <RangeBarTicks ticks={scale.ticks} domainMax={scale.domainMax} />
        </div>
        {sentence && <p className="text-muted-foreground">{sentence}</p>}
      </>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request to ready</CardTitle>
        <CardDescription>
          From a request reaching Radarr or Sonarr to a file on disk
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4">{content}</CardContent>
    </Card>
  )
}

export function RequestToReadyCardSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton description />
      <CardContent className="gap-4">
        <Skeleton className="h-9 w-28" />
        <div className="flex flex-col gap-3">
          {CONTENT_TYPES.map((contentType) => (
            <RangeBarSkeleton key={contentType.type} />
          ))}
          <RangeBarTicksSkeleton />
        </div>
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardContent>
    </Card>
  )
}
