import { useMemo } from 'react'
import { useTheme } from '@/components/theme-provider'
import { PieChart, Pie, Cell, Tooltip, Label } from 'recharts'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Card, CardContent } from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { useContentDistributionData } from '@/features/dashboard/hooks/useChartData'
import InstanceContentBreakdownChart from '@/features/dashboard/components/charts/instance-content-breakdown-chart'
import type { TooltipProps } from 'recharts'
import type {
  ValueType,
  NameType,
} from 'recharts/types/component/DefaultTooltipContent'

/**
 * Displays a dashboard section with a pie chart and legend showing the distribution of content types, alongside a breakdown chart.
 *
 * Retrieves content type distribution data and theme settings, then visualizes the data as a pie chart with a custom tooltip and legend. Also renders a related breakdown chart for further content analysis.
 */
export function ContentDistributionChart() {
  const { data: contentTypeDistribution } = useContentDistributionData()
  const { theme } = useTheme()
  const isDarkMode =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  const cssColors = {
    movie:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-movie')
        .trim() || '#1a5999',
    show:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-show')
        .trim() || '#39b978',
    count:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-count')
        .trim() || '#f47b30',
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

  const contentDistributionData = useMemo(() => {
    return contentTypeDistribution.map((item) => ({
      name: item.type.charAt(0).toUpperCase() + item.type.slice(1),
      count: item.count,
    }))
  }, [contentTypeDistribution])

  const contentDistributionConfig = useMemo(() => {
    const config: ChartConfig = {}

    contentTypeDistribution.forEach((item, index) => {
      const key = item.type
      config[key] = {
        label: item.type.charAt(0).toUpperCase() + item.type.slice(1),
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      }
    })

    return config
  }, [contentTypeDistribution])

  const totalContentItems = useMemo(() => {
    return contentTypeDistribution.reduce((acc, curr) => acc + curr.count, 0)
  }, [contentTypeDistribution])

  const borderColor = isDarkMode ? '#f8f9fa' : '#1a1a1a'

  const ContentDistributionTooltip = ({
    active,
    payload,
  }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload || !payload.length) {
      return null
    }
    const data = payload[0].payload as { name: string; count: number }
    return (
      <div className="bg-background border border-border p-2 rounded-xs shadow-md text-xs">
        <p className="font-medium text-foreground">{data.name}</p>
        <p className="text-foreground">
          <span className="font-medium">Count: </span>
          {data.count.toLocaleString()}
        </p>
        <p className="text-foreground">
          <span className="font-medium">Percentage: </span>
          {Math.round((data.count / totalContentItems) * 100)}%
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Content Type Distribution Card */}
      <div className="flex flex-col">
        <Card className="bg-secondary-background relative shadow-md">
          <div className="bg-main text-foreground px-4 py-3 text-center">
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
                    strokeWidth={2}
                  >
                    {contentDistributionData.map((entry) => {
                      const type = entry.name.toLowerCase()
                      let color = cssColors.count

                      if (type === 'movie') color = cssColors.movie
                      if (type === 'show') color = cssColors.show

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
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm text-foreground">
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
        <InstanceContentBreakdownChart />
      </div>
    </div>
  )
}
