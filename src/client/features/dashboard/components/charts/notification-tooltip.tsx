import type { TooltipProps } from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'

export function NotificationTooltip({
  active,
  payload,
}: TooltipProps<ValueType, NameType>) {
  if (!active || !payload || !payload.length) {
    return null
  }
  const data = payload[0].payload as {
    name: string
    value: number
    total: number
  }
  return (
    <div className="bg-background border border-border p-2 rounded-xs shadow-md">
      <p className="font-medium text-foreground">{data.name}</p>
      <p className="text-foreground">
        <span className="font-medium">Count: </span>
        {data.value}
      </p>
      <p className="text-foreground">
        <span className="font-medium">Percentage: </span>
        {Math.round((data.value / data.total) * 100)}%
      </p>
    </div>
  )
}
