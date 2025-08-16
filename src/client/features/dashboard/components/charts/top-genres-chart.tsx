import { useMemo } from 'react'
import type { TooltipProps } from 'recharts'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'
import { ChartContainer } from '@/components/ui/chart'
import { useTopGenresData } from '@/features/dashboard/hooks/useChartData'

interface GenreChartData {
  name: string
  count: number
}

/**
 * Displays a vertical bar chart of the top 10 music genres by count.
 *
 * Fetches genre data, sorts by frequency, and renders a styled chart with a custom tooltip and legend.
 */
export function TopGenresChart() {
  const { data: topGenres, isLoading } = useTopGenresData()

  // CSS Custom Properties
  const cssColors = useMemo(() => {
    const fun =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--fun')
        .trim() || '#d4b483'
    return { fun }
  }, [])

  // Top Genres data
  const topGenresData = useMemo((): GenreChartData[] => {
    return [...topGenres]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((genre) => ({
        name: genre.genre,
        count: genre.count,
      }))
  }, [topGenres])

  const topGenresConfig = {
    count: {
      label: 'Count',
      color: 'hsl(var(--chart-1))',
    },
  }

  const TopGenresTooltip = ({
    active,
    payload,
  }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload || !payload.length) {
      return null
    }
    const data = payload[0].payload as { name: string; count: number }
    return (
      <div className="bg-background border border-border p-2 rounded-xs shadow-md">
        <p className="font-medium text-foreground">{data.name}</p>
        <p className="text-foreground">
          <span className="font-medium">Count: </span>
          {data.count.toLocaleString()}
        </p>
      </div>
    )
  }

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
    <div className="flex flex-col">
      <ChartContainer
        config={topGenresConfig}
        className="aspect-auto h-[350px] w-full"
      >
        <BarChart
          data={topGenresData}
          layout="vertical"
          accessibilityLayer
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} />
          <YAxis
            dataKey="name"
            type="category"
            width={90}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={false} content={TopGenresTooltip} />
          <Bar
            dataKey="count"
            radius={4}
            background={{ fill: 'rgba(0, 0, 0, 0.05)' }}
            fill={cssColors.fun}
          />
        </BarChart>
      </ChartContainer>
      <div className="flex justify-center mt-3 gap-6">
        <div className="flex items-center">
          <span
            className="h-3 w-3 rounded-full inline-block mr-2"
            style={{ backgroundColor: cssColors.fun }}
          />
          <span className="text-sm text-foreground">Genre Count</span>
        </div>
      </div>
    </div>
  )
}
