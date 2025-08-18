import {
  CHART_CONFIG,
  type ChartConfigItem,
  type ChartType,
} from '@/features/dashboard/lib/chart-types'
import { cn } from '@/lib/utils'

interface ChartHeaderProps {
  activeChart: ChartType
  onChartChange: (chart: ChartType) => void
}

export function ChartHeader({ activeChart, onChartChange }: ChartHeaderProps) {
  return (
    <div className="flex flex-col overflow-hidden">
      {/* Top row with chart description */}
      <div className="bg-main text-black px-6 py-4">
        <h3 className="text-lg font-medium">
          {CHART_CONFIG[activeChart].label}
        </h3>
        <p className="text-sm">{CHART_CONFIG[activeChart].description}</p>
      </div>

      {/* Create a black background container for buttons */}
      <div className="bg-black">
        {/* Tabs row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t-2 border-t-border dark:border-t-darkBorder border-b-2 border-b-border dark:border-b-darkBorder">
          {(Object.entries(CHART_CONFIG) as [ChartType, ChartConfigItem][]).map(
            ([key, config], index) => {
              const isLastInRow = index % 2 === 1
              const needsBorder = activeChart !== key
              const isSecondButton = index === 1

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChartChange(key)}
                  className={cn(
                    'flex h-12 items-center justify-center uppercase text-sm font-medium',
                    activeChart === key
                      ? 'bg-black text-white'
                      : 'bg-main text-black',
                    needsBorder &&
                      index < Object.entries(CHART_CONFIG).length - 1 &&
                      !isLastInRow &&
                      'border-r-2 border-r-border',
                    needsBorder &&
                      isSecondButton &&
                      'sm:border-r-2 border-r-border',
                    index < 2 &&
                      'border-b-2 sm:border-b-0 border-b-border dark:border-b-darkBorder',
                  )}
                >
                  {config.label}
                </button>
              )
            },
          )}
        </div>
      </div>
    </div>
  )
}
