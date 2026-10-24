import { formatCount } from '@/lib/format'

export function rangeLabel(days: number): string {
  return days === 0 ? 'All time' : `Last ${formatCount(days, 'day')}`
}
