import { ColorSwatch } from '@/components/color-swatch'
import { StackedBar } from '@/components/stacked-bar'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ChartColor } from '@/lib/chart-colors'
import { formatCount, formatNumber, formatPercent } from '@/lib/format'
import type { components } from '@/types/api.js'

type ContentTypeCount = components['schemas']['ContentTypeDistribution']

const CONTENT_TYPES = [
  { type: 'movie', label: 'Movies', color: 'chart-movie' },
  { type: 'show', label: 'Shows', color: 'chart-show' },
] as const satisfies ReadonlyArray<{
  type: string
  label: string
  color: ChartColor
}>

export function LibraryMixCard({
  distribution,
}: {
  distribution: ContentTypeCount[]
}) {
  const segments = CONTENT_TYPES.map((contentType) => ({
    ...contentType,
    value: distribution
      .filter((row) => row.type === contentType.type)
      .reduce((sum, row) => sum + row.count, 0),
  }))
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)

  const content =
    total === 0 ? (
      <p className="text-muted-foreground">Nothing tracked yet.</p>
    ) : (
      <>
        <div className="flex flex-col gap-2">
          {segments.map((segment) => (
            <div
              key={segment.type}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2 font-medium">
                <ColorSwatch color={segment.color} />
                {segment.label}
              </span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="font-medium">
                  {formatNumber(segment.value)}
                </span>
                <span className="text-muted-foreground">
                  {formatPercent(segment.value / total)}
                </span>
              </span>
            </div>
          ))}
        </div>
        <StackedBar segments={segments} showLegend={false} />
      </>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Library mix</CardTitle>
        <CardDescription>All time</CardDescription>
        {total > 0 && (
          <CardAction className="text-muted-foreground">
            {formatCount(total, 'item')} tracked
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="gap-4">{content}</CardContent>
    </Card>
  )
}
