import { FilterToolbar } from '@/components/filter-toolbar'
import type { ExclusionsPage } from '@/features/library/hooks/exclusions/useExclusionsPage'
import {
  EXCLUSION_FILTER_OPTIONS,
  EXCLUSIONS_FILTER_WIDTHS,
  STATUS_FILTER_OPTIONS,
} from '@/features/library/lib/exclusions/exclusions-state'
import { useUserOptions } from '@/hooks/useUserOptions'
import { CONTENT_TYPE_FILTER_OPTIONS } from '@/lib/content-type'
import { toolbarFilter } from '@/lib/filter-toolbar'

export function ExclusionsFilters({ page }: { page: ExclusionsPage }) {
  const users = useUserOptions()
  const { state } = page
  const filters = [
    toolbarFilter({
      label: 'User',
      value: state.user,
      options: users,
      onValueChange: (user) => page.update({ user }),
      width: EXCLUSIONS_FILTER_WIDTHS.user,
    }),
    toolbarFilter({
      label: 'Content type',
      value: state.type,
      options: CONTENT_TYPE_FILTER_OPTIONS,
      onValueChange: (type) => page.update({ type }),
      width: EXCLUSIONS_FILTER_WIDTHS.type,
    }),
    toolbarFilter({
      label: 'Status',
      value: state.status,
      options: STATUS_FILTER_OPTIONS,
      onValueChange: (status) => page.update({ status }),
      width: EXCLUSIONS_FILTER_WIDTHS.status,
    }),
    toolbarFilter({
      label: 'Exclusion',
      value: state.exclusion,
      options: EXCLUSION_FILTER_OPTIONS,
      onValueChange: (exclusion) => page.update({ exclusion }),
      width: EXCLUSIONS_FILTER_WIDTHS.exclusion,
    }),
  ]

  return (
    <FilterToolbar
      search={{
        label: 'Search titles',
        value: state.q,
        onValueChange: (q) => page.update({ q }),
      }}
      filters={filters}
      filterCount={page.filterCount}
      filtered={page.filtered}
      onClear={page.clearFilters}
      total={page.total}
      noun="title"
    />
  )
}
