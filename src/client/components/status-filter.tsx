import { cn } from 'cn'
import { FilterSelect } from '@/components/filter-select'
import { SegmentedControl } from '@/components/segmented-control'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatNumber } from '@/lib/format'

export interface StatusFilterOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface StatusFilterProps<T extends string> {
  /** Every status except "all", which the control adds itself. */
  options: ReadonlyArray<StatusFilterOption<T>>
  value: T | 'all'
  onValueChange: (next: T | 'all') => void
}

/** Segmented on desktop, a full-width select on phones. */
export function StatusFilter<T extends string>({
  options,
  value,
  onValueChange,
}: StatusFilterProps<T>) {
  const isMobile = useIsMobile()

  if (isMobile) {
    const items = options.map((option) => ({
      value: option.value,
      label:
        option.count === undefined
          ? option.label
          : `${option.label} (${formatNumber(option.count)})`,
    }))
    return (
      <FilterSelect
        label="All statuses"
        value={value === 'all' ? null : value}
        options={items}
        onValueChange={(next) => onValueChange(next ?? 'all')}
        className="w-full"
      />
    )
  }

  const segments = [
    { value: 'all' as const, label: 'All' },
    ...options.map((option) => ({
      value: option.value,
      label:
        option.count === undefined ? (
          option.label
        ) : (
          <>
            {option.label}
            <Badge variant="secondary">{formatNumber(option.count)}</Badge>
          </>
        ),
    })),
  ]
  return (
    <SegmentedControl<T | 'all'>
      aria-label="Status"
      value={value}
      onValueChange={onValueChange}
      options={segments}
    />
  )
}

/** `className` sizes the desktop control, phones always draw the full-width select. */
export function StatusFilterSkeleton({ className }: { className?: string }) {
  const isMobile = useIsMobile()
  return (
    <Skeleton
      className={isMobile ? 'h-10 w-full' : cn('h-8 max-w-full', className)}
    />
  )
}
