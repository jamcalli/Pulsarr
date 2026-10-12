import { cn } from 'cn'
import type { ComponentProps, ReactElement } from 'react'
import {
  createPopoverHandle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCoarsePointer } from '@/hooks/useCoarsePointer'
import { CHART_FILL, type ChartColor } from '@/lib/chart-colors'

const CHART_POPOVER_CLASS =
  'w-fit max-w-xs gap-0 rounded-lg border-2 border-border bg-card px-3 py-1.5 text-xs shadow-shadow'

export interface ChartTooltipPayload {
  label: string
  value: string
  detail?: string
  color?: ChartColor
}

export interface ChartTooltipHandle {
  tooltip: ReturnType<typeof createTooltipHandle<ChartTooltipPayload>>
  popover: ReturnType<typeof createPopoverHandle<ChartTooltipPayload>>
}

/** One popup shared by several marks, so moving between them moves the open popup instead of closing and reopening it. */
export function createChartTooltipHandle(): ChartTooltipHandle {
  return {
    tooltip: createTooltipHandle<ChartTooltipPayload>(),
    popover: createPopoverHandle<ChartTooltipPayload>(),
  }
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
  const coarsePointer = useCoarsePointer()

  if (coarsePointer) {
    return (
      <Popover>
        <PopoverTrigger render={render} />
        <PopoverContent side="top" className={CHART_POPOVER_CLASS}>
          <ChartTooltipBody {...payload} />
        </PopoverContent>
      </Popover>
    )
  }

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
  const coarsePointer = useCoarsePointer()

  if (coarsePointer) {
    return (
      <PopoverTrigger
        handle={handle.popover}
        payload={payload}
        render={render}
      />
    )
  }

  return (
    <TooltipTrigger handle={handle.tooltip} payload={payload} render={render} />
  )
}

/** The popup for every trigger on `handle`, showing the active one's payload. */
export function SharedChartTooltip({ handle }: { handle: ChartTooltipHandle }) {
  const coarsePointer = useCoarsePointer()

  if (coarsePointer) {
    return (
      <Popover handle={handle.popover}>
        {({ payload }) =>
          payload && (
            <PopoverContent side="top" className={CHART_POPOVER_CLASS}>
              <ChartTooltipBody {...payload} />
            </PopoverContent>
          )
        }
      </Popover>
    )
  }

  return (
    <Tooltip handle={handle.tooltip}>
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
