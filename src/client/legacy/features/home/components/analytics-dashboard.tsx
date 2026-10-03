import { useState } from 'react'
import { Card, CardContent } from '@/legacy/components/ui/card'
import { ChartHeader } from '@/legacy/features/home/components/chart-header'
import { ContentDistributionChart } from '@/legacy/features/home/components/charts/content-distribution-chart'
import { NotificationCharts } from '@/legacy/features/home/components/charts/notification-charts'
import { StatusTransitionsChart } from '@/legacy/features/home/components/charts/status-transition-chart'
import { TopGenresChart } from '@/legacy/features/home/components/charts/top-genres-chart'
import { CHARTS, type ChartType } from '@/legacy/features/home/lib/chart-types'

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
    <div>
      <h2 className="mb-4 text-2xl font-bold text-foreground">
        Media Analytics
      </h2>
      <Card className="w-full bg-card relative overflow-hidden">
        <ChartHeader activeChart={activeChart} onChartChange={setActiveChart} />
        <CardContent className="px-6 py-6">{renderChart()}</CardContent>
      </Card>
    </div>
  )
}
