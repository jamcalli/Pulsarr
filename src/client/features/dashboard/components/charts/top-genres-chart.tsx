import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { useTopGenresData } from '@/features/dashboard/hooks/useChartData'
import type { TooltipProps } from 'recharts'
import type {
  ValueType,
  NameType,
} from 'recharts/types/component/DefaultTooltipContent'

interface GenreChartData {
  name: string
  count: number
}

export function TopGenresChart() {
  const { data: topGenres, isLoading } = useTopGenresData()

  // CSS Custom Properties
  const cssColors = {
    fun:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--fun')
        .trim() || '#d4b483',
  }

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
      <div className="bg-bg border border-border p-2 rounded shadow-md">
        <p className="font-medium text-text">{data.name}</p>
        <p className="text-text">
          <span className="font-medium">Count: </span>
          {data.count.toLocaleString()}
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-text text-muted-foreground">
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
          margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
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
          <span className="text-sm text-text">Genre Count</span>
        </div>
      </div>
    </div>
  )
}
