import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusTransitionsChart } from './charts/status-transitions-chart'
import { NotificationCharts } from './charts/notification-charts'
import { ContentDistributionChart } from './charts/content-distribution-chart'
import { TopGenresChart } from './charts/top-genres-chart'

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

export function AnalyticsDashboard() {
  const [activeChart, setActiveChart] = useState<ChartType>(
    CHARTS.STATUS_TRANSITIONS,
  )

  // Chart header component
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
    switch (activeChart) {
      case CHARTS.STATUS_TRANSITIONS:
        return <StatusTransitionsChart />
      case CHARTS.NOTIFICATIONS:
        return <NotificationCharts />
      case CHARTS.CONTENT_DISTRIBUTION:
        return <ContentDistributionChart />
      case CHARTS.TOP_GENRES:
        return <TopGenresChart />
      default:
        return null
    }
  }

  return (
    <Card className="w-full bg-bw relative overflow-hidden">
      <ChartHeader />
      <div className="px-6 py-6">{renderChart()}</div>
    </Card>
  )
}