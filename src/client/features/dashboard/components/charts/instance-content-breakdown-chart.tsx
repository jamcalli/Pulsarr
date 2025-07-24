import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { useInstanceContentData } from '@/features/dashboard/hooks/useChartData'
import type { TooltipProps } from 'recharts'
import type {
  ValueType,
  NameType,
} from 'recharts/types/component/DefaultTooltipContent'

/**
 * Renders a stacked bar chart visualizing the distribution of content statuses ("grabbed", "notified", "requested") for each instance.
 *
 * Fetches and processes instance content data, displaying a responsive chart with a custom tooltip and legend. Shows a loading or empty state if data is unavailable.
 */
export default function InstanceContentBreakdownChart() {
  const { data: instanceContentBreakdown, isLoading } = useInstanceContentData()

  const cssColors = {
    grabbed:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-1')
        .trim() || '196 39% 33%',
    notified:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-3')
        .trim() || '29 85% 87%',
    requested:
      getComputedStyle(document.documentElement)
        .getPropertyValue('--chart-5')
        .trim() || '1 54% 50%',
  }

  const chartData = useMemo(() => {
    if (!instanceContentBreakdown || instanceContentBreakdown.length === 0) {
      return []
    }

    return instanceContentBreakdown.map((instance) => {
      const statusData = {
        grabbed: 0,
        notified: 0,
        requested: 0,
      }

      for (const status of instance.by_status) {
        const statusKey = status.status as keyof typeof statusData
        if (statusKey in statusData) {
          statusData[statusKey] = status.count
        }
      }

      return {
        name: instance.name,
        type: instance.type,
        total: instance.total_items,
        ...statusData,
      }
    })
  }, [instanceContentBreakdown])

  const chartConfig = useMemo<ChartConfig>(() => {
    return {
      grabbed: {
        label: 'Grabbed',
        color: 'hsl(var(--chart-1))',
      },
      notified: {
        label: 'Notified',
        color: 'hsl(var(--chart-3))',
      },
      requested: {
        label: 'Requested',
        color: 'hsl(var(--chart-5))',
      },
    }
  }, [])

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload || !payload.length) {
      return null
    }

    const data = payload[0].payload as {
      name: string
      type: string
      total: number
      grabbed: number
      notified: number
      requested: number
    }

    const totalItemsInInstance = data.grabbed + data.notified + data.requested

    return (
      <div className="bg-background border border-border p-2 rounded-xs shadow-md text-xs">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-foreground">
          <span className="font-medium">Total Items: </span>
          {data.total.toLocaleString()}
        </p>

        <div className="mt-1">
          <p className="text-foreground">
            <span className="font-medium">Grabbed: </span>
            {data.grabbed.toLocaleString()}
            <span className="ml-1">
              ({Math.round((data.grabbed / totalItemsInInstance) * 100)}%)
            </span>
          </p>

          <p className="text-foreground">
            <span className="font-medium">Notified: </span>
            {data.notified.toLocaleString()}
            <span className="ml-1">
              ({Math.round((data.notified / totalItemsInInstance) * 100)}%)
            </span>
          </p>

          <p className="text-foreground">
            <span className="font-medium">Requested: </span>
            {data.requested.toLocaleString()}
            <span className="ml-1">
              ({Math.round((data.requested / totalItemsInInstance) * 100)}%)
            </span>
          </p>
        </div>
      </div>
    )
  }

  if (
    isLoading ||
    !instanceContentBreakdown ||
    instanceContentBreakdown.length === 0
  ) {
    return (
      <div className="h-full">
        <Card className="bg-secondary-background relative shadow-md h-full flex flex-col">
          <div className="bg-main text-black px-4 py-3 text-center shrink-0">
            <h4 className="text-base font-medium">
              Instance Content Breakdown
            </h4>
          </div>
          <CardContent className="pt-4 grow flex flex-col justify-center">
            <div className="grow w-full md:min-h-0 min-h-[450px]">
              <div className="h-full w-full flex items-center justify-center">
                <span className="text-foreground text-muted-foreground">
                  {isLoading
                    ? 'Loading instance data...'
                    : 'No instance data available'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full">
      <Card className="bg-secondary-background relative shadow-md h-full flex flex-col">
        <div className="bg-main text-black px-4 py-3 text-center shrink-0">
          <h4 className="text-base font-medium">Instance Content Breakdown</h4>
        </div>
        <CardContent className="pt-4 grow flex flex-col">
          <div className="grow w-full md:min-h-0 min-h-[350px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart
                data={chartData}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />

                <Bar
                  dataKey="grabbed"
                  stackId="a"
                  name="Grabbed"
                  fill={`hsl(${cssColors.grabbed})`}
                />
                <Bar
                  dataKey="notified"
                  stackId="a"
                  name="Notified"
                  fill={`hsl(${cssColors.notified})`}
                />
                <Bar
                  dataKey="requested"
                  stackId="a"
                  name="Requested"
                  fill={`hsl(${cssColors.requested})`}
                />
              </BarChart>
            </ChartContainer>
          </div>

          <div className="flex flex-wrap justify-center mt-3 gap-3 shrink-0">
            <div className="flex items-center">
              <span
                className="h-3 w-3 rounded-full inline-block mr-2"
                style={{ backgroundColor: `hsl(${cssColors.grabbed})` }}
              />
              <span className="text-sm text-foreground">Grabbed</span>
            </div>
            <div className="flex items-center">
              <span
                className="h-3 w-3 rounded-full inline-block mr-2"
                style={{ backgroundColor: `hsl(${cssColors.notified})` }}
              />
              <span className="text-sm text-foreground">Notified</span>
            </div>
            <div className="flex items-center">
              <span
                className="h-3 w-3 rounded-full inline-block mr-2"
                style={{ backgroundColor: `hsl(${cssColors.requested})` }}
              />
              <span className="text-sm text-foreground">Requested</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
