import { useMemo } from 'react'
import { useTheme } from '@/components/theme-provider'
import { PieChart, Pie, Cell, Tooltip, Label } from 'recharts'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Card, CardContent } from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { useNotificationStatsData } from '@/features/dashboard/hooks/useChartData'
import type { TooltipProps } from 'recharts'
import type {
  ValueType,
  NameType,
} from 'recharts/types/component/DefaultTooltipContent'

interface NotificationChartData {
  name: string
  value: number
}

/**
 * Displays two responsive pie charts summarizing notification statistics by channel and by type.
 *
 * Fetches notification data, processes it for visualization, and adapts chart appearance to the current theme and system color scheme. Shows a loading or empty state if data is unavailable.
 */
export function NotificationCharts() {
  const { data: notificationStats, isLoading } = useNotificationStatsData()
  const { theme } = useTheme()
  const isDarkMode =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  // CSS Custom Properties
  const cssColors = {
    chart1:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-1')
        .trim() || '196 39% 33%',
    chart2:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-2')
        .trim() || '183 37% 49%',
    chart3:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-3')
        .trim() || '29 85% 87%',
    chart4:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-4')
        .trim() || '19 91% 59%',
    chart5:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-5')
        .trim() || '1 54% 50%',
  }

  // Notifications chart data
  const notificationsData = useMemo(() => {
    if (!notificationStats)
      return {
        byChannel: [] as NotificationChartData[],
        byType: [] as NotificationChartData[],
      }

    const byChannel =
      notificationStats.by_channel?.map((item) => ({
        name: item.channel.charAt(0).toUpperCase() + item.channel.slice(1),
        value: item.count,
      })) || []

    const byType =
      notificationStats.by_type?.map((item) => ({
        name: item.type
          .replaceAll('_', ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        value: item.count,
      })) || []

    return { byChannel, byType }
  }, [notificationStats])

  // Generate notification chart configs
  const notificationsByChannelConfig = useMemo(() => {
    const config: ChartConfig = {}

    if (notificationStats?.by_channel) {
      notificationStats.by_channel.forEach((item, index) => {
        const key = item.channel
        config[key] = {
          label: item.channel.charAt(0).toUpperCase() + item.channel.slice(1),
          color: `hsl(var(--chart-${(index % 5) + 1}))`,
        }
      })
    }

    return config
  }, [notificationStats])

  const notificationsByTypeConfig = useMemo(() => {
    const config: ChartConfig = {}

    if (notificationStats?.by_type) {
      notificationStats.by_type.forEach((item, index) => {
        const key = item.type
        config[key] = {
          label: item.type
            .replaceAll('_', ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          color: `hsl(var(--chart-${(index % 5) + 1}))`,
        }
      })
    }

    return config
  }, [notificationStats])

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
      <div className="bg-background border border-border p-2 rounded-xs shadow-md">
        <p className="font-medium text-foreground">{data.name}</p>
        <p className="text-foreground">
          <span className="font-medium">Count: </span>
          {data.value}
        </p>
        <p className="text-foreground">
          <span className="font-medium">Percentage: </span>
          {Math.round((data.value / data.total) * 100)}%
        </p>
      </div>
    )
  }

  const getTotalByChannel = useMemo(() => {
    return notificationsData.byChannel.reduce(
      (sum, item) => sum + item.value,
      0,
    )
  }, [notificationsData.byChannel])

  const getTotalByType = useMemo(() => {
    return notificationsData.byType.reduce((sum, item) => sum + item.value, 0)
  }, [notificationsData.byType])

  if (isLoading || !notificationStats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-foreground text-muted-foreground">
          {isLoading
            ? 'Loading notification data...'
            : 'No notification data available'}
        </span>
      </div>
    )
  }

  const borderColor = isDarkMode ? '#f8f9fa' : '#1a1a1a'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="flex flex-col">
        <Card className="bg-secondary-background relative shadow-md">
          <div className="bg-main text-foreground px-4 py-3 text-center">
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
                      total: getTotalByChannel,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="30%"
                    outerRadius="70%"
                    strokeWidth={2}
                  >
                    {notificationsData.byChannel.map((item, index) => (
                      <Cell
                        key={`channel-cell-${item.name}`}
                        fill={getHSLColor(index)}
                        stroke={borderColor}
                        strokeWidth={1}
                      />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
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
                                {getTotalByChannel.toLocaleString()}
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
                                Total
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
              {notificationsData.byChannel.map((entry, index) => (
                <div
                  key={`channel-legend-${entry.name}`}
                  className="flex items-center"
                >
                  <span
                    className="h-3 w-3 rounded-full inline-block mr-2"
                    style={{
                      backgroundColor: getHSLColor(index),
                    }}
                  />
                  <span className="text-sm text-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col">
        <Card className="bg-secondary-background relative shadow-md">
          <div className="bg-main text-foreground px-4 py-3 text-center">
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
                  <Tooltip content={NotificationTooltip} />
                  <Pie
                    data={notificationsData.byType.map((item) => ({
                      ...item,
                      total: getTotalByType,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="30%"
                    outerRadius="70%"
                    strokeWidth={2}
                  >
                    {notificationsData.byType.map((item, index) => (
                      <Cell
                        key={`type-cell-${item.name}`}
                        fill={getHSLColor(index)}
                        stroke={borderColor}
                        strokeWidth={1}
                      />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
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
                                {getTotalByType.toLocaleString()}
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
                                Total
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
              {notificationsData.byType.map((entry, index) => (
                <div
                  key={`type-legend-${entry.name}`}
                  className="flex items-center"
                >
                  <span
                    className="h-3 w-3 rounded-full inline-block mr-2"
                    style={{
                      backgroundColor: getHSLColor(index),
                    }}
                  />
                  <span className="text-sm text-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
