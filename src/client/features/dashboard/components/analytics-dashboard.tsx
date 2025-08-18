import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ChartHeader } from '@/features/dashboard/components/chart-header'
import { ContentDistributionChart } from '@/features/dashboard/components/charts/content-distribution-chart'
import { NotificationCharts } from '@/features/dashboard/components/charts/notification-charts'
import { StatusTransitionsChart } from '@/features/dashboard/components/charts/status-transition-chart'
import { TopGenresChart } from '@/features/dashboard/components/charts/top-genres-chart'
import { CHARTS, type ChartType } from '@/features/dashboard/lib/chart-types'

/**
 * Displays a media analytics dashboard with tabbed navigation for selecting and viewing different chart types.
 *
 * Shows a card containing a header with the active chart's label and description, a tabbed interface for switching charts, and the currently selected analytics chart.
 */
export function AnalyticsDashboard() {
  const [activeChart, setActiveChart] = useState<ChartType>(
    CHARTS.STATUS_TRANSITIONS,
  )

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
    <div className="mb-8">
      <h2 className="mb-4 text-2xl font-bold text-foreground">
        Media Analytics
      </h2>
      <Card className="w-full bg-secondary-background relative overflow-hidden">
        <ChartHeader activeChart={activeChart} onChartChange={setActiveChart} />
        <CardContent className="px-6 py-6">{renderChart()}</CardContent>
      </Card>
    </div>
  )
}
