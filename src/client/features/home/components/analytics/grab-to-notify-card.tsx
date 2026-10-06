import { RangeBar, RangeBarTicks } from '@/components/range-bar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

type GrabTime = components['schemas']['GrabbedToNotifiedTime']

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

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-0.5 bg-foreground" />
        Average
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-3 w-5 rounded-xs border-2 border-border bg-chart-track"
        />
        Fastest to slowest
      </li>
    </ul>
  )
}

export function GrabToNotifyCard({ times }: { times: GrabTime[] }) {
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

  const content =
    rows.length === 0 ? (
      <p className="text-muted-foreground">
        Nothing was grabbed in this range.
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
        <Legend />
        {sentence && <p className="text-muted-foreground">{sentence}</p>}
      </>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grab to notify</CardTitle>
        <CardDescription>
          From a download being grabbed to the user hearing it's ready
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4">{content}</CardContent>
    </Card>
  )
}
