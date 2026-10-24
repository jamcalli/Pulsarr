import { cn } from 'cn'
import { CHART_FILL, type ChartColor } from '@/lib/chart-colors'

export function ColorSwatch({ color }: { color: ChartColor }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-3 shrink-0 rounded-xs border-2 border-border',
        CHART_FILL[color],
      )}
    />
  )
}
