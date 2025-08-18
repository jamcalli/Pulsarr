import type { TooltipProps } from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'
import { calculatePercentage } from '@/lib/utils'

export function InstanceContentBreakdownTooltip({
  active,
  payload,
  label,
}: TooltipProps<ValueType, NameType>) {
  if (!active || !payload || !payload.length) {
    return null
  }

  const raw = payload[0]?.payload as Partial<{
    name: string
    type: string
    total: number
    grabbed: number
    notified: number
    requested: number
  }>
  if (!raw) return null

  const data = {
    name: raw.name ?? '',
    type: raw.type ?? '',
    total: raw.total ?? 0,
    grabbed: raw.grabbed ?? 0,
    notified: raw.notified ?? 0,
    requested: raw.requested ?? 0,
  }

  // Use data.total as denominator to match displayed "Total Items"
  const totalItemsInInstance = data.total

  return (
    <div className="bg-background border border-border p-2 rounded-xs shadow-md text-xs">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-foreground">
        <span className="font-medium">Total Items: </span>
        {data.total.toLocaleString()}
      </p>

      <div className="mt-1">
        <p className="text-foreground">
          <span className="font-medium">Grabbed: </span>
          {data.grabbed.toLocaleString()}
          <span className="ml-1">
            ({calculatePercentage(data.grabbed, totalItemsInInstance)}%)
          </span>
        </p>

        <p className="text-foreground">
          <span className="font-medium">Notified: </span>
          {data.notified.toLocaleString()}
          <span className="ml-1">
            ({calculatePercentage(data.notified, totalItemsInInstance)}%)
          </span>
        </p>

        <p className="text-foreground">
          <span className="font-medium">Requested: </span>
          {data.requested.toLocaleString()}
          <span className="ml-1">
            ({calculatePercentage(data.requested, totalItemsInInstance)}%)
          </span>
        </p>
      </div>
    </div>
  )
}
