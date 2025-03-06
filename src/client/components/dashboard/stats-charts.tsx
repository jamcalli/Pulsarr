import { useState, useEffect, useMemo } from 'react'
import { useStatsStore } from '@/stores/statsStore'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Label,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import type {
  StatusTransitionTime,
  ContentTypeDistribution,
  GenreStat,
  NotificationStats,
} from '@root/schemas/stats/stats.schema'

// Define local chart-specific types
interface StatusTransitionChartData {
  transitionName: string
  movie: number
  show: number
}

interface NotificationChartData {
  name: string
  value: number
}

interface GenreChartData {
  name: string
  count: number
}

interface ChartData {
  statusTransitions: StatusTransitionTime[]
  notificationStats: NotificationStats | null
  contentTypeDistribution: ContentTypeDistribution[]
  topGenres: GenreStat[]
}

const CHARTS = {
  STATUS_TRANSITIONS: 'status_transitions',
  NOTIFICATIONS: 'notifications',
  CONTENT_DISTRIBUTION: 'content_distribution',
  TOP_GENRES: 'top_genres',
} as const

type ChartType = (typeof CHARTS)[keyof typeof CHARTS]

interface ChartConfigItem {
  label: string
  description: string
}

const CHART_CONFIG: Record<ChartType, ChartConfigItem> = {
  [CHARTS.STATUS_TRANSITIONS]: {
    label: 'Status Transitions',
    description: 'Average days for status transitions by content type',
  },
  [CHARTS.NOTIFICATIONS]: {
    label: 'Notifications',
    description: 'Notification distribution by channel and type',
  },
  [CHARTS.CONTENT_DISTRIBUTION]: {
    label: 'Content Distribution',
    description: 'Distribution of content types',
  },
  [CHARTS.TOP_GENRES]: {
    label: 'Top Genres',
    description: 'Most popular content genres',
  },
}

function TypedStatsDashboard() {
  // Local component state
  const [activeChart, setActiveChart] = useState<ChartType>(
    CHARTS.STATUS_TRANSITIONS,
  )
  const [chartData, setChartData] = useState<ChartData>({
    statusTransitions: [],
    notificationStats: null,
    contentTypeDistribution: [],
    topGenres: [],
  })
  const [isLoading, setIsLoading] = useState(true)

  // Get a reference to the store without causing re-renders
  const getStoreData = useStatsStore.getState

  // One-time data fetch on mount
  useEffect(() => {
    // Function to get data from store
    const fetchData = () => {
      const storeState = getStoreData()
      setChartData({
        statusTransitions: storeState.statusTransitions || [],
        notificationStats: storeState.notificationStats,
        contentTypeDistribution: storeState.contentTypeDistribution || [],
        topGenres: storeState.topGenres || [],
      })
      setIsLoading(false)
    }

    // Initial fetch
    fetchData()

    // Set up a listener for store changes
    const unsubscribe = useStatsStore.subscribe(fetchData)

    // Cleanup
    return () => {
      unsubscribe()
    }
  }, [])

  // Status Transitions chart config and data
  const statusTransitionsData = useMemo(() => {
    const grouped: Record<string, StatusTransitionChartData> = {}

    chartData.statusTransitions.forEach((transition) => {
      const key = `${transition.from_status} → ${transition.to_status}`

      if (!grouped[key]) {
        grouped[key] = {
          transitionName: key,
          movie: 0,
          show: 0,
        }
      }

      if (transition.content_type === 'movie') {
        grouped[key].movie = Number.parseFloat(transition.avg_days.toFixed(2))
      } else if (transition.content_type === 'show') {
        grouped[key].show = Number.parseFloat(transition.avg_days.toFixed(2))
      }
    })

    return Object.values(grouped)
  }, [chartData.statusTransitions])

  const statusTransitionsConfig = {
    movie: {
      label: 'Movies',
      color: 'hsl(var(--chart-1))',
    },
    show: {
      label: 'Shows',
      color: 'hsl(var(--chart-2))',
    },
  } satisfies ChartConfig

  // Notifications chart config and data
  const notificationsData = useMemo(() => {
    if (!chartData.notificationStats)
      return {
        byChannel: [] as NotificationChartData[],
        byType: [] as NotificationChartData[],
      }

    const byChannel = chartData.notificationStats.by_channel.map((item) => ({
      name: item.channel.charAt(0).toUpperCase() + item.channel.slice(1),
      value: item.count,
    }))

    const byType = chartData.notificationStats.by_type.map((item) => ({
      name: item.type
        .replace('_', ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      value: item.count,
    }))

    return { byChannel, byType }
  }, [chartData.notificationStats])

  // Generate notification chart configs
  const notificationsByChannelConfig = useMemo(() => {
    const config: Record<string, any> = {}

    if (chartData.notificationStats) {
      chartData.notificationStats.by_channel.forEach((item, index) => {
        const key = item.channel
        config[key] = {
          label: item.channel.charAt(0).toUpperCase() + item.channel.slice(1),
          color: `hsl(var(--chart-${(index % 5) + 1}))`,
        }
      })
    }

    return config
  }, [chartData.notificationStats]) as ChartConfig

  const notificationsByTypeConfig = useMemo(() => {
    const config: Record<string, any> = {}

    if (chartData.notificationStats) {
      chartData.notificationStats.by_type.forEach((item, index) => {
        const key = item.type
        config[key] = {
          label: item.type
            .replace('_', ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          color: `hsl(var(--chart-${(index % 5) + 1}))`,
        }
      })
    }

    return config
  }, [chartData.notificationStats]) as ChartConfig

  // Content Distribution chart config and data
  const contentDistributionData = useMemo(() => {
    return chartData.contentTypeDistribution.map((item) => ({
      name: item.type.charAt(0).toUpperCase() + item.type.slice(1),
      count: item.count,
    }))
  }, [chartData.contentTypeDistribution])

  const contentDistributionConfig = useMemo(() => {
    const config: Record<string, any> = {}

    chartData.contentTypeDistribution.forEach((item, index) => {
      const key = item.type
      config[key] = {
        label: item.type.charAt(0).toUpperCase() + item.type.slice(1),
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      }
    })

    return config
  }, [chartData.contentTypeDistribution]) as ChartConfig

  // Calculate total content items for the donut chart center
  const totalContentItems = useMemo(() => {
    return chartData.contentTypeDistribution.reduce(
      (acc, curr) => acc + curr.count,
      0,
    )
  }, [chartData.contentTypeDistribution])

  // Top Genres chart config and data
  const topGenresData = useMemo((): GenreChartData[] => {
    return [...chartData.topGenres]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((genre) => ({
        name: genre.genre,
        count: genre.count,
      }))
  }, [chartData.topGenres])

  const topGenresConfig = {
    count: {
      label: 'Count',
      color: 'hsl(var(--chart-1))',
    },
  } satisfies ChartConfig

  // Custom header component
  const ChartHeader = () => {
    return (
      <div className="flex flex-col overflow-hidden">
        {/* Top row with chart description */}
        <div className="bg-main text-text px-6 py-4">
          <h3 className="text-lg font-medium">
            {CHART_CONFIG[activeChart].label}
          </h3>
          <p className="text-sm">{CHART_CONFIG[activeChart].description}</p>
        </div>

        {/* Create a black background container for buttons */}
        <div className="bg-black">
          {/* Tabs row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border-t-2 border-t-border dark:border-t-darkBorder border-b-2 border-b-border dark:border-b-darkBorder">
            {(
              Object.entries(CHART_CONFIG) as [ChartType, ChartConfigItem][]
            ).map(([key, config], index) => {
              const isLastInRow = index % 2 === 1

              const needsBorder = activeChart !== key

              const isSecondButton = index === 1

              return (
                <button
                  key={key}
                  onClick={() => setActiveChart(key)}
                  className={cn(
                    'flex h-12 items-center justify-center uppercase text-sm font-medium',
                    // For active buttons, just use black bg with white text
                    activeChart === key
                      ? 'bg-black text-white'
                      : 'bg-main text-text',
                    // Right borders for inactive buttons that aren't at the end of a row
                    needsBorder &&
                      index < Object.entries(CHART_CONFIG).length - 1 &&
                      !isLastInRow &&
                      'border-r-2 border-r-border dark:border-r-darkBorder',
                    // Add the middle border in desktop view between buttons 1 and 2
                    needsBorder &&
                      isSecondButton &&
                      'sm:border-r-2 border-r-border dark:border-r-darkBorder',
                    // Bottom border for mobile first row
                    index < 2 &&
                      'border-b-2 sm:border-b-0 border-b-border dark:border-b-darkBorder',
                  )}
                >
                  {config.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Rendering the selected chart
  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <span className="text-text text-muted-foreground">
            Loading chart data...
          </span>
        </div>
      )
    }

    switch (activeChart) {
      case CHARTS.STATUS_TRANSITIONS:
        return (
          <ChartContainer
            config={statusTransitionsConfig}
            className="aspect-auto h-[350px] w-full"
          >
            <BarChart
              data={statusTransitionsData}
              accessibilityLayer
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 80,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="transitionName"
                angle={0}
                tickLine={false}
                tickMargin={10}
                height={50}
                axisLine={false}
              />
              <YAxis
                label={{
                  value: 'Avg Days',
                  angle: -90,
                  position: 'insideLeft',
                }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="movie" fill="var(--color-movie)" radius={4} />
              <Bar dataKey="show" fill="var(--color-show)" radius={4} />
            </BarChart>
          </ChartContainer>
        )

      case CHARTS.NOTIFICATIONS:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-bg relative">
              <div className="bg-main text-text px-4 py-3 text-center">
                <h4 className="text-base font-medium">By Channel</h4>
              </div>
              <CardContent className="pt-4">
                <ChartContainer
                  config={notificationsByChannelConfig}
                  className="mx-auto aspect-square h-[250px] [&_.recharts-pie-label-text]:fill-foreground"
                >
                  <PieChart
                    margin={{
                      top: 5,
                      right: 5,
                      bottom: 5,
                      left: 5,
                    }}
                  >
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={notificationsData.byChannel}
                      dataKey="value"
                      nameKey="name"
                      label
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card className="bg-bg relative">
              <div className="bg-main text-text px-4 py-3 text-center">
                <h4 className="text-base font-medium">By Type</h4>
              </div>
              <CardContent className="pt-4">
                <ChartContainer
                  config={notificationsByTypeConfig}
                  className="mx-auto aspect-square h-[250px] [&_.recharts-pie-label-text]:fill-foreground"
                >
                  <PieChart
                    margin={{
                      top: 5,
                      right: 5,
                      bottom: 5,
                      left: 5,
                    }}
                  >
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={notificationsData.byType}
                      dataKey="value"
                      nameKey="name"
                      label
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                    />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        )

      case CHARTS.CONTENT_DISTRIBUTION:
        // For content distribution, we need to adjust the data format for the chart config
        const contentPieData = contentDistributionData.map((item) => ({
          ...item,
          value: item.count,
        }))

        return (
          <ChartContainer
            config={contentDistributionConfig}
            className="mx-auto aspect-square h-[350px]"
          >
            <PieChart
              margin={{
                top: 5,
                right: 5,
                bottom: 5,
                left: 5,
              }}
            >
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={contentPieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={120}
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-3xl font-bold text-text"
                          >
                            {totalContentItems.toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground text-text"
                          >
                            Items
                          </tspan>
                        </text>
                      )
                    }
                    return null
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        )

      case CHARTS.TOP_GENRES:
        return (
          <ChartContainer
            config={topGenresConfig}
            className="aspect-auto h-[350px] w-full"
          >
            <BarChart
              data={topGenresData}
              layout="vertical"
              accessibilityLayer
              margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={80}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={4}
                background={{ fill: 'rgba(0, 0, 0, 0.05)' }}
              />
            </BarChart>
          </ChartContainer>
        )

      default:
        return null
    }
  }

  return (
    <Card className="w-full bg-bg relative overflow-hidden">
      <ChartHeader />
      <CardContent className="px-6 py-6">{renderChart()}</CardContent>
    </Card>
  )
}

export default TypedStatsDashboard
