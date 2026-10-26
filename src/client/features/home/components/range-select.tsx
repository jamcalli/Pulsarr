import { CompactSelect } from '@/components/compact-select'
import {
  DASHBOARD_DAYS,
  type DashboardDays,
} from '@/features/home/lib/home-prefs'
import { rangeLabel } from '@/features/home/lib/range-label'

const DAY_OPTIONS = DASHBOARD_DAYS.map((days) => ({
  value: days,
  label: rangeLabel(days),
}))

interface RangeSelectProps {
  value: DashboardDays
  onValueChange: (next: DashboardDays) => void
}

export function RangeSelect({ value, onValueChange }: RangeSelectProps) {
  return (
    <CompactSelect
      label="Date range"
      value={value}
      options={DAY_OPTIONS}
      onValueChange={onValueChange}
    />
  )
}
