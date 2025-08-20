import type { StatusTransitionTime } from '@root/schemas/stats/stats.schema'
import { useMemo } from 'react'

// Chart-specific types
type ContentGroup = 'Movies' | 'Shows'
interface GroupedDataItem {
  contentType: ContentGroup
  totalCount: number
  totalAvgDays: number
  minDays: number
  maxDays: number
}

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { useStatusTransitionData } from '@/features/dashboard/hooks/useChartData'

/**
 * Renders a vertical bar chart comparing the average, minimum, and maximum time in minutes for status transitions that lead to "notified" status (from "grabbed" or "requested") for movies and shows.
 *
 * Shows a loading indicator while data is being fetched. The chart displays error bars for average values, reference lines for min/max values, and a legend that distinguishes movies and shows by color and line style.
 */
export function StatusTransitionsChart() {
  const { data: statusTransitions, isLoading } = useStatusTransitionData()

  // CSS Custom Properties
  const cssColors = useMemo(() => {
    if (typeof window === 'undefined' || !document?.documentElement) {
      return { movie: '#1a5999', show: '#39b978', error: '#c1666b' }
    }
    const root = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) =>
      root.getPropertyValue(name).trim() || fallback
    return {
      movie: read('--color-movie', '#1a5999'),
      show: read('--color-show', '#39b978'),
      error: read('--error', '#c1666b'),
    }
  }, [])

  // All transitions to notified chart data
  const notifiedByContentTypeData = useMemo(() => {
    // Filter status transitions for those that end in "notified" status
    const notifiedTransitions = (
      (statusTransitions ?? []) as StatusTransitionTime[]
    ).filter(
      (t) =>
        t.to_status === 'notified' &&
        (t.from_status === 'grabbed' || t.from_status === 'requested'),
    )

    // Group by content type and aggregate data

    const groupedData = notifiedTransitions.reduce<
      Partial<Record<ContentGroup, GroupedDataItem>>
    >((acc, transition: StatusTransitionTime) => {
      const mapContentType = (t?: string): ContentGroup => {
        switch (t?.toLowerCase()) {
          case 'movie':
            return 'Movies'
          case 'show':
          case 'series':
          case 'episode':
            return 'Shows'
          default:
            return 'Shows'
        }
      }
      const key = mapContentType(transition.content_type)

      const existingGroup = acc[key]
      if (!existingGroup) {
        acc[key] = {
          contentType: key,
          totalCount: transition.count,
          totalAvgDays: transition.avg_days * transition.count,
          minDays: transition.min_days,
          maxDays: transition.max_days,
        }
      } else {
        existingGroup.totalCount += transition.count
        existingGroup.totalAvgDays += transition.avg_days * transition.count
        existingGroup.minDays = Math.min(
          existingGroup.minDays,
          transition.min_days,
        )
        existingGroup.maxDays = Math.max(
          existingGroup.maxDays,
          transition.max_days,
        )
      }

      return acc
    }, {})

    // Convert grouped data to chart format
    const MINUTES_PER_DAY = 1440
    const toMinutes = (days: number) =>
      Math.round(days * MINUTES_PER_DAY * 100) / 100

    const groups = Object.values(groupedData).filter(
      Boolean,
    ) as GroupedDataItem[]
    return groups
      .filter(
        (g) =>
          g.totalCount > 0 &&
          Number.isFinite(g.minDays) &&
          Number.isFinite(g.maxDays),
      )
      .sort((a, b) =>
        a.contentType === b.contentType
          ? 0
          : a.contentType === 'Movies'
            ? -1
            : 1,
      )
      .map((group: GroupedDataItem) => {
        const avgDays = group.totalAvgDays / group.totalCount
        const avgMinutes = toMinutes(avgDays)
        const minMinutes = toMinutes(group.minDays)
        const maxMinutes = toMinutes(group.maxDays)
        return {
          contentType: group.contentType,
          avgMinutes,
          minMinutes,
          maxMinutes,
          count: group.totalCount,
          errorX:
            group.minDays !== group.maxDays
              ? [
                  toMinutes(avgDays - group.minDays),
                  toMinutes(group.maxDays - avgDays),
                ]
              : ([0, 0] as [number, number]),
        }
      })
  }, [statusTransitions])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-foreground text-muted-foreground">
          Loading chart data...
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full">
      <ChartContainer
        config={{
          avgMinutes: {
            label: 'Average Minutes',
            color: 'hsl(var(--chart-1))',
          },
        }}
        className="aspect-auto h-[350px] w-full"
      >
        <BarChart
          data={notifiedByContentTypeData}
          layout="vertical"
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={true}
            vertical={false}
          />
          <XAxis
            type="number"
            label={{
              value: 'Minutes',
              position: 'insideBottom',
              offset: -10,
            }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="contentType"
            type="category"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={(props: TooltipProps<number, string>) => {
              if (!props.active || !props.payload || !props.payload.length) {
                return null
              }
              const data = props.payload[0].payload as {
                contentType: string
                avgMinutes: number
                minMinutes: number
                maxMinutes: number
                count: number
              }
              return (
                <div className="bg-background border border-border p-2 rounded-xs shadow-md">
                  <p className="font-medium text-foreground">
                    {data.contentType}
                  </p>
                  <p className="text-foreground">
                    <span className="font-medium">Avg: </span>
                    {data.avgMinutes} min
                  </p>
                  <p className="text-foreground">
                    <span className="font-medium">Min: </span>
                    {data.minMinutes} min
                  </p>
                  <p className="text-foreground">
                    <span className="font-medium">Max: </span>
                    {data.maxMinutes} min
                  </p>
                  <p className="text-foreground">
                    <span className="font-medium">Count: </span>
                    {data.count} {data.count === 1 ? 'item' : 'items'}
                  </p>
                </div>
              )
            }}
          />

          {/* Main bar for averages */}
          <Bar
            dataKey="avgMinutes"
            fill={cssColors.movie}
            radius={4}
            barSize={30}
          >
            {/* Display sample size (count) as a label on each bar */}
            {notifiedByContentTypeData.map((entry, index) => (
              <text
                key={`text-${entry.contentType}-${entry.avgMinutes}-${entry.count}-${index}`}
                x={entry.avgMinutes > 5 ? 25 : entry.avgMinutes + 3}
                y={index * 40 + 20}
                textAnchor={entry.avgMinutes > 5 ? 'end' : 'start'}
                fill={entry.avgMinutes > 5 ? 'white' : 'black'}
                fontWeight="500"
                fontSize={12}
              >
                {entry.count} {entry.count === 1 ? 'item' : 'items'}
              </text>
            ))}

            {/* Use a single ErrorBar with default styling */}
            <ErrorBar
              dataKey="errorX"
              width={4}
              strokeWidth={2}
              stroke={cssColors.error}
              direction="x"
              key="errorbar-x"
            />

            {notifiedByContentTypeData.map((entry, index) => (
              <Cell
                key={`bar-cell-${entry.contentType}-${entry.avgMinutes}-${entry.count}-${index}`}
                fill={
                  entry.contentType === 'Movies'
                    ? cssColors.movie
                    : cssColors.show
                }
              />
            ))}
          </Bar>

          {/* Add reference lines for each data point's min and max */}
          {notifiedByContentTypeData.flatMap((entry, index) => {
            // Only show reference lines if min != max
            if (entry.minMinutes === entry.maxMinutes) {
              return []
            }

            const lineColor =
              entry.contentType === 'Movies' ? cssColors.movie : cssColors.show

            return [
              <ReferenceLine
                key={`refline-min-${index}-${entry.contentType}-${entry.minMinutes}`}
                x={entry.minMinutes}
                stroke={lineColor}
                strokeOpacity={0.6}
                strokeDasharray="3 3"
                isFront={true}
                ifOverflow="extendDomain"
              />,
              <ReferenceLine
                key={`refline-max-${index}-${entry.contentType}-${entry.maxMinutes}`}
                x={entry.maxMinutes}
                stroke={lineColor}
                strokeOpacity={0.6}
                strokeDasharray="3 3"
                isFront={true}
                ifOverflow="extendDomain"
              />,
            ]
          })}
        </BarChart>
      </ChartContainer>

      <div className="flex flex-wrap justify-center mt-3 gap-6">
        <div className="flex items-center">
          <span
            className="h-3 w-3 rounded-full inline-block mr-2"
            style={{ backgroundColor: cssColors.movie }}
          />
          <span className="text-sm text-foreground">Movies (avg)</span>
        </div>
        <div className="flex items-center">
          <span
            className="h-3 w-3 rounded-full inline-block mr-2"
            style={{ backgroundColor: cssColors.show }}
          />
          <span className="text-sm text-foreground">Shows (avg)</span>
        </div>

        {/* Movies min/max with dashed line */}
        <div className="flex items-center">
          <span className="inline-block mr-2 w-5 relative">
            <hr
              className="absolute top-1/2 w-full"
              style={{
                borderColor: cssColors.movie,
                borderWidth: '1px',
                borderStyle: 'dashed',
                opacity: 0.8,
              }}
            />
          </span>
          <span className="text-sm text-foreground">Movies (min/max)</span>
        </div>

        {/* Shows min/max with dashed line */}
        <div className="flex items-center">
          <span className="inline-block mr-2 w-5 relative">
            <hr
              className="absolute top-1/2 w-full"
              style={{
                borderColor: cssColors.show,
                borderWidth: '1px',
                borderStyle: 'dashed',
                opacity: 0.8,
              }}
            />
          </span>
          <span className="text-sm text-foreground">Shows (min/max)</span>
        </div>
      </div>
    </div>
  )
}
