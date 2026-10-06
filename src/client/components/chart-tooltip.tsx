import { cn } from 'cn'
import type { ComponentProps, ReactElement } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CHART_FILL, type ChartColor } from '@/lib/chart-colors'

interface ChartTooltipProps {
  render: ReactElement
  label: string
  value: string
  detail?: string
  color?: ChartColor
  trackCursorAxis?: ComponentProps<typeof Tooltip>['trackCursorAxis']
}

export function ChartTooltip({
  render,
  label,
  value,
  detail,
  color,
  trackCursorAxis,
}: ChartTooltipProps) {
  return (
    <Tooltip trackCursorAxis={trackCursorAxis}>
      <TooltipTrigger render={render} />
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            {color && (
              <span
                className={cn(
                  'h-0.5 w-3 shrink-0 rounded-full',
                  CHART_FILL[color],
                )}
              />
            )}
            <span className="font-bold tabular-nums">{value}</span>
            <span className="text-muted-foreground">{label}</span>
          </div>
          {detail && (
            <span className="text-muted-foreground tabular-nums">{detail}</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
