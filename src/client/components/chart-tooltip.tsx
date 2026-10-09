import { cn } from 'cn'
import type { ComponentProps, ReactElement } from 'react'
import {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CHART_FILL, type ChartColor } from '@/lib/chart-colors'

export interface ChartTooltipPayload {
  label: string
  value: string
  detail?: string
  color?: ChartColor
}

export type ChartTooltipHandle = ReturnType<
  typeof createTooltipHandle<ChartTooltipPayload>
>

/** One tooltip shared by several marks, so moving between them moves the open popup instead of closing and reopening it. */
export function createChartTooltipHandle(): ChartTooltipHandle {
  return createTooltipHandle<ChartTooltipPayload>()
}

function ChartTooltipBody({
  label,
  value,
  detail,
  color,
}: ChartTooltipPayload) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        {color && (
          <span
            className={cn('h-0.5 w-3 shrink-0 rounded-full', CHART_FILL[color])}
          />
        )}
        <span className="font-bold tabular-nums">{value}</span>
        <span className="text-muted-foreground">{label}</span>
      </div>
      {detail && (
        <span className="text-muted-foreground tabular-nums">{detail}</span>
      )}
    </div>
  )
}

interface ChartTooltipProps extends ChartTooltipPayload {
  render: ReactElement
  trackCursorAxis?: ComponentProps<typeof Tooltip>['trackCursorAxis']
}

export function ChartTooltip({
  render,
  trackCursorAxis,
  ...payload
}: ChartTooltipProps) {
  return (
    <Tooltip trackCursorAxis={trackCursorAxis}>
      <TooltipTrigger render={render} />
      <TooltipContent>
        <ChartTooltipBody {...payload} />
      </TooltipContent>
    </Tooltip>
  )
}

export function ChartTooltipTrigger({
  handle,
  payload,
  render,
}: {
  handle: ChartTooltipHandle
  payload: ChartTooltipPayload
  render: ReactElement
}) {
  return <TooltipTrigger handle={handle} payload={payload} render={render} />
}

/** The popup for every trigger on `handle`, showing the active one's payload. */
export function SharedChartTooltip({ handle }: { handle: ChartTooltipHandle }) {
  return (
    <Tooltip handle={handle}>
      {({ payload }) =>
        payload && (
          <TooltipContent>
            <ChartTooltipBody {...payload} />
          </TooltipContent>
        )
      }
    </Tooltip>
  )
}
