import { cn } from 'cn'
import type { ReactNode } from 'react'
import { ChartTooltip } from '@/components/chart-tooltip'
import { CHART_FILL, type ChartColor } from '@/lib/chart-colors'
import { formatNumber, formatPercent } from '@/lib/format'

interface StatBarHeaderProps {
  label: string
  valueText: string
  icon?: ReactNode
  percentText?: string
}

export function StatBarHeader({
  label,
  valueText,
  icon,
  percentText,
}: StatBarHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate font-medium">{label}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
        <span className="font-medium">{valueText}</span>
        {percentText && (
          <span className="text-muted-foreground">{percentText}</span>
        )}
      </span>
    </div>
  )
}

interface StatBarProps {
  label: string
  value: number
  total: number
  color: ChartColor
  icon?: ReactNode
  detail?: ReactNode
  /** Replaces the plain number shown for `value`. */
  valueText?: string
  showPercent?: boolean
}

export function StatBar({
  label,
  value,
  total,
  color,
  icon,
  detail,
  valueText = formatNumber(value),
  showPercent = true,
}: StatBarProps) {
  const ratio = total > 0 ? Math.min(value / total, 1) : 0

  return (
    <div className="flex flex-col gap-1.5">
      <StatBarHeader
        icon={icon}
        label={label}
        valueText={valueText}
        percentText={showPercent ? formatPercent(ratio) : undefined}
      />
      <ChartTooltip
        label={label}
        value={valueText}
        detail={showPercent ? formatPercent(ratio) : undefined}
        color={color}
        trackCursorAxis="x"
        render={
          <button
            type="button"
            data-slot="stat-bar-track"
            aria-label={`${label}: ${valueText}`}
            className="block h-3 w-full overflow-hidden rounded-sm bg-chart-track outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0 transition-opacity pointer-fine:group-has-[[data-slot=stat-bar-track]:hover]/stat-list:not-hover:opacity-60 group-has-[[data-slot=stat-bar-track]:focus-visible]/stat-list:not-focus-visible:opacity-60"
          >
            {ratio > 0 && (
              <span
                data-slot="stat-bar-fill"
                className={cn(
                  'block h-full min-w-2 rounded-r-sm border-2 border-border',
                  CHART_FILL[color],
                )}
                style={{ width: `${ratio * 100}%` }}
              />
            )}
          </button>
        }
      />
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  )
}

export function StatBarList({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={cn('group/stat-list', className)}>{children}</div>
}
