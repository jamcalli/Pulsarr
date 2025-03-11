import { useState, useEffect, useMemo } from 'react'
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Label,
  Tooltip,
  ErrorBar,
  ReferenceLine,
} from 'recharts'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Card, CardContent } from '@/components/ui/card'
import { type ChartConfig, ChartContainer } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import type {
  StatusTransitionTime,
  ContentTypeDistribution,
  GenreStat,
  NotificationStats,
  InstanceBreakdown,
} from '@root/schemas/stats/stats.schema'
import { useTheme } from '@/components/theme-provider'
import type { TooltipProps } from 'recharts'
import type {
  ValueType,
  NameType,
} from 'recharts/types/component/DefaultTooltipContent'

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
  instanceContentBreakdown: InstanceBreakdown[] | null
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
    label: 'Request to Notify',
    description: 'Time taken from request to notification (in minutes)',
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
  const [activeChart, setActiveChart] = useState<ChartType>(
    CHARTS.STATUS_TRANSITIONS,
  )
  const [chartData, setChartData] = useState<ChartData>({
    statusTransitions: [],
    notificationStats: null,
    contentTypeDistribution: [],
    topGenres: [],
    instanceContentBreakdown: null,
  })
  const [isLoading, setIsLoading] = useState(true)

  const getStoreData = useDashboardStore.getState

  useEffect(() => {
    const fetchData = () => {
      const storeState = getStoreData()
      setChartData({
        statusTransitions: storeState.statusTransitions || [],
        notificationStats: storeState.notificationStats,
        contentTypeDistribution: storeState.contentTypeDistribution || [],
        topGenres: storeState.topGenres || [],
        instanceContentBreakdown: storeState.instanceContentBreakdown || [],
      })
      setIsLoading(false)
    }

    fetchData()

    const unsubscribe = useDashboardStore.subscribe(fetchData)

    return () => {
      unsubscribe()
    }
  }, [getStoreData])

  const useCssVariableColors = () => {
    const [colors, setColors] = useState({
      movie: '',
      show: '',
      count: '',
      fun: '',
      blue: '',
      chart1: '',
      chart2: '',
      chart3: '',
      chart4: '',
      chart5: '',
      error: '',
    })

    useEffect(() => {
      // Get the computed CSS variable values
      const computedStyle = getComputedStyle(document.documentElement)
      setColors({
        movie: computedStyle.getPropertyValue('--color-movie').trim(),
        show: computedStyle.getPropertyValue('--color-show').trim(),
        count: computedStyle.getPropertyValue('--color-count').trim(),
        fun: computedStyle.getPropertyValue('--fun').trim(),
        blue: computedStyle.getPropertyValue('--blue').trim(),
        chart1: computedStyle.getPropertyValue('--chart-1').trim(),
        chart2: computedStyle.getPropertyValue('--chart-2').trim(),
        chart3: computedStyle.getPropertyValue('--chart-3').trim(),
        chart4: computedStyle.getPropertyValue('--chart-4').trim(),
        chart5: computedStyle.getPropertyValue('--chart-5').trim(),
        error: computedStyle.getPropertyValue('--error').trim(),
      })
    }, [])

    return colors
  }

  // Then in your component, near your other useMemo hooks:
  const cssColors = useCssVariableColors()

  // Status Transitions chart config and data
  const requestToNotifyData = useMemo(() => {
    // Filter the data to only include requested → notified transitions
    const filteredData = chartData.statusTransitions.filter(
      (transition) =>
        transition.from_status === 'requested' &&
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
      errorX: [
        Math.round(
          (transition.avg_days - transition.min_days) * 24 * 60 * 100,
        ) / 100,
        Math.round(
          (transition.max_days - transition.avg_days) * 24 * 60 * 100,
        ) / 100,
      ],
    }))
  }, [chartData.statusTransitions])

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
    const config: ChartConfig = {}

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
  }, [chartData.notificationStats])

  const notificationsByTypeConfig = useMemo(() => {
    const config: ChartConfig = {}

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
  }, [chartData.notificationStats])

  // Content Distribution chart config and data
  const contentDistributionData = useMemo(() => {
    return chartData.contentTypeDistribution.map((item) => ({
      name: item.type.charAt(0).toUpperCase() + item.type.slice(1),
      count: item.count,
    }))
  }, [chartData.contentTypeDistribution])

  const contentDistributionConfig = useMemo(() => {
    const config: ChartConfig = {}

    chartData.contentTypeDistribution.forEach((item, index) => {
      const key = item.type
      config[key] = {
        label: item.type.charAt(0).toUpperCase() + item.type.slice(1),
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      }
    })

    return config
  }, [chartData.contentTypeDistribution])

  // Calculate total content items for the donut chart center
  const totalContentItems = useMemo(() => {
    return chartData.contentTypeDistribution.reduce(
      (acc, curr) => acc + curr.count,
      0,
    )
  }, [chartData.contentTypeDistribution])

  const instanceContentData = useMemo(() => {
    if (!chartData.instanceContentBreakdown) return []

    return chartData.instanceContentBreakdown.map((instance) => ({
      name: instance.name,
      value: instance.total_items,
      primaryItems: instance.primary_items,
      type: instance.type,
      byStatus: instance.by_status,
      byContentType: instance.by_content_type,
    }))
  }, [chartData.instanceContentBreakdown])

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
                  type="button"
                  onClick={() => setActiveChart(key)}
                  className={cn(
                    'flex h-12 items-center justify-center uppercase text-sm font-medium',
                    activeChart === key
                      ? 'bg-black text-white'
                      : 'bg-main text-text',
                    needsBorder &&
                      index < Object.entries(CHART_CONFIG).length - 1 &&
                      !isLastInRow &&
                      'border-r-2 border-r-border dark:border-r-darkBorder',
                    needsBorder &&
                      isSecondButton &&
                      'sm:border-r-2 border-r-border dark:border-r-darkBorder',
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
                width={500}
                height={300}
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
                    if (
                      !props.active ||
                      !props.payload ||
                      !props.payload.length
                    ) {
                      return null
                    }
                    const data = props.payload[0].payload
                    return (
                      <div className="bg-bg border border-border p-2 rounded shadow-md">
                        <p className="font-medium text-text">
                          {data.contentType}
                        </p>
                        <p className="text-text">
                          <span className="font-medium">Avg: </span>
                          {data.avgMinutes} min
                        </p>
                        <p className="text-text">
                          <span className="font-medium">Min: </span>
                          {data.minMinutes} min
                        </p>
                        <p className="text-text">
                          <span className="font-medium">Max: </span>
                          {data.maxMinutes} min
                        </p>
                        <p className="text-text">
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
                  fill={cssColors.movie || '#0c2d5c'}
                  radius={4}
                  barSize={30}
                >
                  {/* Display sample size (count) as a label on each bar */}
                  {requestToNotifyData.map((entry, index) => (
                    <text
                      key={`${entry.contentType}-${entry.avgMinutes}-${entry.count}`}
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
                    stroke={cssColors.error || '#2c5878'}
                    direction="x"
                  />

                  {/* Apply different color for each content type */}
                  {requestToNotifyData.map((entry) => (
                    <Cell
                      key={`bar-cell-${entry.contentType}-${entry.avgMinutes}-${entry.count}`}
                      fill={
                        entry.contentType === 'Movies'
                          ? cssColors.movie || '#0c2d5c'
                          : cssColors.show || '#1a663d'
                      }
                    />
                  ))}
                </Bar>

                {/* Add reference lines for each data point's min and max */}
                {requestToNotifyData.flatMap((entry) => {
                  const lineColor =
                    entry.contentType === 'Movies'
                      ? cssColors.movie || '#0c2d5c'
                      : cssColors.show || '#1a663d'

                  const transparentLineColor = `${lineColor}99` // 60% opacity

                  return [
                    <ReferenceLine
                      key={`min-${entry.contentType}-${entry.minMinutes}-${entry.avgMinutes}`}
                      x={entry.minMinutes}
                      stroke={transparentLineColor}
                      strokeDasharray="3 3"
                      isFront={true}
                      ifOverflow="extendDomain"
                    />,
                    <ReferenceLine
                      key={`max-${entry.contentType}-${entry.maxMinutes}-${entry.avgMinutes}`}
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
                  style={{ backgroundColor: cssColors.movie || '#1a5999' }}
                />
                <span className="text-sm text-text">Movies (avg)</span>
              </div>
              <div className="flex items-center">
                <span
                  className="h-3 w-3 rounded-full inline-block mr-2"
                  style={{ backgroundColor: cssColors.show || '#39b978' }}
                />
                <span className="text-sm text-text">Shows (avg)</span>
              </div>

              {/* Movies min/max with dashed line */}
              <div className="flex items-center">
                <span className="inline-block mr-2 w-5 relative">
                  <hr
                    className="absolute top-1/2 w-full"
                    style={{
                      borderColor: cssColors.movie || '#1a5999',
                      borderWidth: '1px',
                      borderStyle: 'dashed',
                      opacity: 0.8,
                    }}
                  />
                </span>
                <span className="text-sm text-text">Movies (min/max)</span>
              </div>

              {/* Shows min/max with dashed line */}
              <div className="flex items-center">
                <span className="inline-block mr-2 w-5 relative">
                  <hr
                    className="absolute top-1/2 w-full"
                    style={{
                      borderColor: cssColors.show || '#39b978',
                      borderWidth: '1px',
                      borderStyle: 'dashed',
                      opacity: 0.8,
                    }}
                  />
                </span>
                <span className="text-sm text-text">Shows (min/max)</span>
              </div>
            </div>
          </div>
        )

      case CHARTS.NOTIFICATIONS: {
        const { theme } = useTheme()
        const isDarkMode =
          theme === 'dark' ||
          (theme === 'system' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches)
        const borderColor = isDarkMode ? '#f8f9fa' : '#1a1a1a'

        const getHSLColor = (index: number) => {
          const chartVars = [
            cssColors.chart4 || '19 91% 59%',
            cssColors.chart2 || '183 37% 49%',
            cssColors.chart5 || '1 54% 50%',
            cssColors.chart3 || '29 85% 87%',
            cssColors.chart1 || '196 39% 33%',
          ]
          return `hsl(${chartVars[index % 5]})`
        }

        const NotificationTooltip = ({
          active,
          payload,
        }: TooltipProps<ValueType, NameType>) => {
          if (!active || !payload || !payload.length) {
            return null
          }
          const data = payload[0].payload as {
            name: string
            value: number
            total: number
          }
          return (
            <div className="bg-bg border border-border p-2 rounded shadow-md">
              <p className="font-medium text-text">{data.name}</p>
              <p className="text-text">
                <span className="font-medium">Count: </span>
                {data.value}
              </p>
              <p className="text-text">
                <span className="font-medium">Percentage: </span>
                {Math.round((data.value / data.total) * 100)}%
              </p>
            </div>
          )
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <Card className="bg-bw relative shadow-md">
                <div className="bg-main text-text px-4 py-3 text-center">
                  <h4 className="text-base font-medium">By Channel</h4>
                </div>
                <CardContent className="pt-4">
                  <AspectRatio ratio={1} className="w-full">
                    <ChartContainer
                      config={notificationsByChannelConfig}
                      className="w-full h-full"
                    >
                      <PieChart
                        margin={{
                          top: 5,
                          right: 5,
                          bottom: 5,
                          left: 5,
                        }}
                      >
                        <Tooltip content={NotificationTooltip} />
                        <Pie
                          data={notificationsData.byChannel.map((item) => ({
                            ...item,
                            total: notificationsData.byChannel.reduce(
                              (sum, i) => sum + i.value,
                              0,
                            ),
                          }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius="80%"
                        >
                          {notificationsData.byChannel.map((item) => (
                            <Cell
                              key={`channel-cell-${item.name}`}
                              fill={getHSLColor(
                                notificationsData.byChannel.findIndex(
                                  (i) => i.name === item.name,
                                ),
                              )}
                              stroke={borderColor}
                              strokeWidth={1}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </AspectRatio>
                </CardContent>
              </Card>
              <div className="flex flex-wrap justify-center mt-3 gap-3">
                {notificationsData.byChannel.map((entry) => (
                  <div
                    key={`channel-legend-${entry.name}`}
                    className="flex items-center"
                  >
                    <span
                      className="h-3 w-3 rounded-full inline-block mr-2"
                      style={{
                        backgroundColor: getHSLColor(
                          notificationsData.byChannel.findIndex(
                            (i) => i.name === entry.name,
                          ),
                        ),
                      }}
                    />
                    <span className="text-sm text-text">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col">
              <Card className="bg-bw relative shadow-md">
                <div className="bg-main text-text px-4 py-3 text-center">
                  <h4 className="text-base font-medium">By Type</h4>
                </div>
                <CardContent className="pt-4">
                  <AspectRatio ratio={1} className="w-full">
                    <ChartContainer
                      config={notificationsByTypeConfig}
                      className="w-full h-full"
                    >
                      <PieChart
                        margin={{
                          top: 5,
                          right: 5,
                          bottom: 5,
                          left: 5,
                        }}
                      >
                        {/* Make sure the tooltip is inside the PieChart */}
                        <Tooltip content={NotificationTooltip} />
                        <Pie
                          data={notificationsData.byType.map((item) => ({
                            ...item,
                            total: notificationsData.byType.reduce(
                              (sum, i) => sum + i.value,
                              0,
                            ),
                          }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius="80%"
                        >
                          {notificationsData.byType.map((item) => (
                            <Cell
                              key={`type-cell-${item.name}`}
                              fill={getHSLColor(
                                notificationsData.byType.findIndex(
                                  (i) => i.name === item.name,
                                ),
                              )}
                              stroke={borderColor}
                              strokeWidth={1}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </AspectRatio>
                </CardContent>
              </Card>
              <div className="flex flex-wrap justify-center mt-3 gap-3">
                {notificationsData.byType.map((entry) => (
                  <div
                    key={`type-legend-${entry.name}`}
                    className="flex items-center"
                  >
                    <span
                      className="h-3 w-3 rounded-full inline-block mr-2"
                      style={{
                        backgroundColor: getHSLColor(
                          notificationsData.byType.findIndex(
                            (i) => i.name === entry.name,
                          ),
                        ),
                      }}
                    />
                    <span className="text-sm text-text">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      }

      case CHARTS.CONTENT_DISTRIBUTION: {
        const ContentDistributionTooltip = ({
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
              <p className="text-text">
                <span className="font-medium">Percentage: </span>
                {Math.round((data.count / totalContentItems) * 100)}%
              </p>
            </div>
          )
        }

        const InstanceTooltip = ({
          active,
          payload,
        }: TooltipProps<ValueType, NameType>) => {
          if (!active || !payload || !payload.length) {
            return null
          }
          const data = payload[0].payload
          return (
            <div className="bg-bg border border-border p-2 rounded shadow-md">
              <p className="font-medium text-text">{data.name}</p>
              <p className="text-text">
                <span className="font-medium">Total Items: </span>
                {data.value.toLocaleString()}
              </p>
              <p className="text-text">
                <span className="font-medium">Primary Items: </span>
                {data.primaryItems.toLocaleString()}
              </p>
              <p className="text-text">
                <span className="font-medium">Type: </span>
                {data.type === 'sonarr' ? 'Sonarr' : 'Radarr'}
              </p>
            </div>
          )
        }

        // Config for instance chart
        const instanceChartConfig = {
          value: {
            label: 'Items',
            color: 'hsl(var(--chart-1))',
          },
        } satisfies ChartConfig

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Content Type Distribution Card */}
            <div className="flex flex-col">
              <Card className="bg-bw relative shadow-md">
                <div className="bg-main text-text px-4 py-3 text-center">
                  <h4 className="text-base font-medium">Content Types</h4>
                </div>
                <CardContent className="pt-4">
                  <AspectRatio ratio={1} className="w-full">
                    <ChartContainer
                      config={contentDistributionConfig}
                      className="w-full h-full"
                    >
                      <PieChart
                        margin={{
                          top: 5,
                          right: 5,
                          bottom: 5,
                          left: 5,
                        }}
                      >
                        <Tooltip
                          cursor={false}
                          content={ContentDistributionTooltip}
                        />
                        <Pie
                          data={contentDistributionData}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="30%"
                          outerRadius="70%"
                          strokeWidth={5}
                        >
                          {contentDistributionData.map((entry) => {
                            const type = entry.name.toLowerCase()
                            let color = cssColors.count

                            if (type === 'movie') color = cssColors.movie
                            if (type === 'show') color = cssColors.show

                            if (!color) {
                              const fallbacks = {
                                movie: '#1a5999',
                                show: '#39b978',
                                count: '#f47b30',
                              }
                              color =
                                type === 'movie'
                                  ? fallbacks.movie
                                  : type === 'show'
                                    ? fallbacks.show
                                    : fallbacks.count
                            }

                            const { theme } = useTheme()
                            const isDarkMode =
                              theme === 'dark' ||
                              (theme === 'system' &&
                                window.matchMedia(
                                  '(prefers-color-scheme: dark)',
                                ).matches)
                            const borderColor = isDarkMode
                              ? '#f8f9fa'
                              : '#1a1a1a'

                            return (
                              <Cell
                                key={`cell-${entry.name}`}
                                fill={color}
                                stroke={borderColor}
                                strokeWidth={1}
                              />
                            )
                          })}
                          <Label
                            content={({ viewBox }) => {
                              if (
                                viewBox &&
                                'cx' in viewBox &&
                                'cy' in viewBox
                              ) {
                                const { theme } = useTheme()

                                const isDarkMode =
                                  theme === 'dark' ||
                                  (theme === 'system' &&
                                    window.matchMedia(
                                      '(prefers-color-scheme: dark)',
                                    ).matches)

                                const textColor = isDarkMode ? 'white' : 'black'

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
                                      className="font-bold"
                                      style={{
                                        fill: textColor,
                                        fontSize: '1.5rem',
                                      }}
                                    >
                                      {totalContentItems.toLocaleString()}
                                    </tspan>
                                    <tspan
                                      x={viewBox.cx}
                                      y={(viewBox.cy || 0) + 24}
                                      style={{
                                        fill: isDarkMode
                                          ? 'rgba(255,255,255,0.7)'
                                          : 'rgba(0,0,0,0.7)',
                                      }}
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
                  </AspectRatio>
                  <div className="flex flex-wrap justify-center mt-3 gap-3">
                    {contentDistributionData.map((entry) => {
                      const type = entry.name.toLowerCase()
                      let color = cssColors.count
                      if (type === 'movie') color = cssColors.movie
                      if (type === 'show') color = cssColors.show

                      return (
                        <div
                          key={`content-legend-${entry.name}`}
                          className="flex items-center"
                        >
                          <span
                            className="h-3 w-3 rounded-full inline-block mr-2"
                            style={{ backgroundColor: color || '#f47b30' }}
                          />
                          <span className="text-sm text-text">
                            {entry.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Instance Content Breakdown Card */}
            <div className="flex flex-col">
              <Card className="bg-bw relative shadow-md">
                <div className="bg-main text-text px-4 py-3 text-center">
                  <h4 className="text-base font-medium">Instance Breakdown</h4>
                </div>
                <CardContent className="pt-4">
                  {!instanceContentData || instanceContentData.length === 0 ? (
                    <div className="flex h-64 items-center justify-center">
                      <span className="text-text text-muted-foreground">
                        No instance data available
                      </span>
                    </div>
                  ) : (
                    <>
                      <ChartContainer
                        config={instanceChartConfig}
                        className="aspect-auto h-[250px] w-full"
                      >
                        <BarChart
                          data={instanceContentData}
                          layout="vertical"
                          margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            dataKey="name"
                            type="category"
                            width={80}
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip content={InstanceTooltip} />
                          <Bar dataKey="value" name="Total Items" radius={4}>
                            {instanceContentData.map((entry) => (
                              <Cell
                                key={`cell-${entry.name}`}
                                fill={
                                  entry.type === 'sonarr'
                                    ? cssColors.show || '#39b978'
                                    : cssColors.movie || '#1a5999'
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                      <div className="flex flex-wrap justify-center mt-3 gap-3">
                        <div className="flex items-center">
                          <span
                            className="h-3 w-3 rounded-full inline-block mr-2"
                            style={{
                              backgroundColor: cssColors.movie || '#1a5999',
                            }}
                          />
                          <span className="text-sm text-text">
                            Radarr Instances
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span
                            className="h-3 w-3 rounded-full inline-block mr-2"
                            style={{
                              backgroundColor: cssColors.show || '#39b978',
                            }}
                          />
                          <span className="text-sm text-text">
                            Sonarr Instances
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )
      }

      case CHARTS.TOP_GENRES: {
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
                  width={80}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip cursor={false} content={TopGenresTooltip} />
                <Bar
                  dataKey="count"
                  radius={4}
                  background={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                  fill={cssColors.fun || '#d4b483'}
                />
              </BarChart>
            </ChartContainer>
            <div className="flex justify-center mt-3 gap-6">
              <div className="flex items-center">
                <span
                  className="h-3 w-3 rounded-full inline-block mr-2"
                  style={{ backgroundColor: cssColors.fun || '#d4b483' }}
                />
                <span className="text-sm text-text">Genre Count</span>
              </div>
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <Card className="w-full bg-bw relative overflow-hidden">
      <ChartHeader />
      <CardContent className="px-6 py-6">{renderChart()}</CardContent>
    </Card>
  )
}

export default TypedStatsDashboard
