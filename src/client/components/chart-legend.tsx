import { ColorSwatch } from '@/components/color-swatch'
import type { ChartColor } from '@/lib/chart-colors'
import { formatNumber } from '@/lib/format'

export interface ChartLegendItem {
  label: string
  color: ChartColor
  value?: number
}

export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <ColorSwatch color={item.color} />
          <span>{item.label}</span>
          {item.value !== undefined && (
            <span className="text-muted-foreground tabular-nums">
              {formatNumber(item.value)}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
