import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { useStatusTransitionData } from '@/features/dashboard/hooks/useChartData'

/**
 * Renders a vertical bar chart comparing the average, minimum, and maximum time in minutes for status transitions that lead to "notified" (from "grabbed" or "requested") for movies and shows.
 *
 * Shows a loading indicator while data is being fetched. The chart displays error bars for average values, reference lines for min/max values, and a legend that distinguishes movies and shows by color and line style.
 */
export function StatusTransitionsChart() {
  const { data: statusTransitions, isLoading } = useStatusTransitionData()

  // CSS Custom Properties
  const cssColors = {
    movie:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-movie')
        .trim() || '#1a5999',
    show:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-show')
        .trim() || '#39b978',
    error:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--error')
        .trim() || '#c1666b',
  }

  // Request to Notify chart data
  const requestToNotifyData = useMemo(() => {
    // Filter the data to include transitions that lead to notification
    const filteredData = (statusTransitions ?? []).filter(
      (transition) =>
        (transition.from_status === 'grabbed' ||
          transition.from_status === 'requested') &&
        transition.to_status === 'notified',
    )

    return filteredData.map((transition) => ({
      contentType: transition.content_type === 'movie' ? 'Movies' : 'Shows',
      // Convert from days to minutes
      avgMinutes: Math.round(transition.avg_days * 24 * 60 * 100) / 100,
      minMinutes: Math.round(transition.min_days * 24 * 60 * 100) / 100,
      maxMinutes: Math.round(transition.max_days * 24 * 60 * 100) / 100,
      count: transition.count,

      // Add these properties that the ErrorBar component will use automatically
      // Only add error bars if min != max to avoid duplicate keys
      errorX:
        transition.min_days !== transition.max_days
          ? [
              Math.round(
                (transition.avg_days - transition.min_days) * 24 * 60 * 100,
              ) / 100,
              Math.round(
                (transition.max_days - transition.avg_days) * 24 * 60 * 100,
              ) / 100,
            ]
          : [0, 0],
    }))
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
          data={requestToNotifyData}
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
            content={(props) => {
              if (!props.active || !props.payload || !props.payload.length) {
                return null
              }
              const data = props.payload[0].payload
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
            {requestToNotifyData.map((entry, index) => (
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

            {/* Apply different color for each content type */}
            {requestToNotifyData.map((entry, index) => (
              <defs key={`grad-${entry.contentType}-${index}`}>
                <linearGradient
                  id={`colorBar-${entry.contentType}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <stop
                    offset="0%"
                    stopColor={
                      entry.contentType === 'Movies'
                        ? cssColors.movie
                        : cssColors.show
                    }
                  />
                  <stop
                    offset="100%"
                    stopColor={
                      entry.contentType === 'Movies'
                        ? cssColors.movie
                        : cssColors.show
                    }
                  />
                </linearGradient>
              </defs>
            ))}

            {requestToNotifyData.map((entry, index) => (
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
          {requestToNotifyData.flatMap((entry, index) => {
            // Only show reference lines if min != max
            if (entry.minMinutes === entry.maxMinutes) {
              return []
            }

            const lineColor =
              entry.contentType === 'Movies' ? cssColors.movie : cssColors.show

            const transparentLineColor = `${lineColor}99` // 60% opacity

            return [
              <ReferenceLine
                key={`refline-min-${index}-${entry.contentType}-${entry.minMinutes}`}
                x={entry.minMinutes}
                stroke={transparentLineColor}
                strokeDasharray="3 3"
                isFront={true}
                ifOverflow="extendDomain"
              />,
              <ReferenceLine
                key={`refline-max-${index}-${entry.contentType}-${entry.maxMinutes}`}
                x={entry.maxMinutes}
                stroke={transparentLineColor}
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
