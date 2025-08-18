import type { TooltipProps } from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'

interface ContentDistributionTooltipProps
  extends TooltipProps<ValueType, NameType> {
  totalContentItems: number
}

export function ContentDistributionTooltip({
  active,
  payload,
  totalContentItems,
}: ContentDistributionTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null
  }
  const data = payload[0].payload as { name: string; count: number }
  return (
    <div className="bg-background border border-border p-2 rounded-xs shadow-md text-xs">
      <p className="font-medium text-foreground">{data.name}</p>
      <p className="text-foreground">
        <span className="font-medium">Count: </span>
        {data.count.toLocaleString()}
      </p>
      <p className="text-foreground">
        <span className="font-medium">Percentage: </span>
        {Math.round((data.count / totalContentItems) * 100)}%
      </p>
    </div>
  )
}
