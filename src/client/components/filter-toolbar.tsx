import { ClearFiltersButton } from '@/components/clear-filters-button'
import { FilterDrawer } from '@/components/filter-drawer'
import { FilterField } from '@/components/filter-field'
import { FilterSelect } from '@/components/filter-select'
import { SearchField, SearchFieldSkeleton } from '@/components/search-field'
import { FieldGroup } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { ToolbarFilter } from '@/lib/filter-toolbar'
import { formatCount } from '@/lib/format'

const DESKTOP_ROW = 'flex flex-wrap items-center gap-2'
const PHONE_COLUMN = 'flex flex-col gap-2'
const PHONE_ROW = 'flex items-center justify-between gap-2'

interface FilterToolbarProps {
  search: { label: string; value: string; onValueChange: (q: string) => void }
  filters: ReadonlyArray<ToolbarFilter>
  filterCount: number
  filtered: boolean
  onClear: () => void
  /** The result count and its noun label the phone drawer's close button. */
  total: number
  noun: string
}

export function FilterToolbar({
  search,
  filters,
  filterCount,
  filtered,
  onClear,
  total,
  noun,
}: FilterToolbarProps) {
  const isMobile = useIsMobile()
  const searchField = (
    <SearchField
      label={search.label}
      value={search.value}
      onValueChange={search.onValueChange}
    />
  )
  const clear = <ClearFiltersButton filtered={filtered} onClear={onClear} />
  const selects = filters.map((filter) => (
    <FilterSelect
      key={filter.label}
      label={filter.label}
      value={filter.value}
      options={filter.options}
      onValueChange={filter.onValueChange}
      className={filter.width}
    />
  ))

  if (!isMobile) {
    return (
      <div className={DESKTOP_ROW}>
        {searchField}
        {selects}
        {clear}
      </div>
    )
  }

  if (filters.length === 1) {
    return (
      <div className={PHONE_COLUMN}>
        {searchField}
        <div className={PHONE_ROW}>
          {selects}
          {clear}
        </div>
      </div>
    )
  }

  const showLabel =
    total > 0 ? `Show ${formatCount(total, noun)}` : 'Show results'
  return (
    <div className={PHONE_COLUMN}>
      {searchField}
      <div className={PHONE_ROW}>
        <FilterDrawer
          count={filterCount}
          filtered={filtered}
          onClear={onClear}
          closeLabel={showLabel}
        >
          <FieldGroup className="gap-4">
            {filters.map((filter) => (
              <FilterField
                key={filter.label}
                label={filter.label}
                value={filter.value}
                options={filter.options}
                onValueChange={filter.onValueChange}
              />
            ))}
          </FieldGroup>
        </FilterDrawer>
        {clear}
      </div>
    </div>
  )
}

/** `widths` maps each filter's key to the width its loaded select draws at. */
export function FilterToolbarSkeleton({
  widths,
}: {
  widths: Readonly<Record<string, string>>
}) {
  const isMobile = useIsMobile()
  const entries = Object.entries(widths)
  const selects = entries.map(([key, width]) => (
    <Skeleton key={key} className={`h-10 ${width}`} />
  ))
  if (isMobile) {
    return (
      <div className={PHONE_COLUMN}>
        <SearchFieldSkeleton />
        <div className={PHONE_ROW}>
          {entries.length === 1 ? selects : <Skeleton className="h-10 w-24" />}
        </div>
      </div>
    )
  }
  return (
    <div className={DESKTOP_ROW}>
      <SearchFieldSkeleton />
      {selects}
    </div>
  )
}
