import { ListX } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { NoMatchesEmpty } from '@/components/no-matches-empty'
import type { ExclusionsPage } from '@/features/library/hooks/exclusions/useExclusionsPage'

export function ExclusionsEmpty({ page }: { page: ExclusionsPage }) {
  if (page.filtered) {
    return (
      <NoMatchesEmpty
        title="No titles match these filters"
        description="Try another search, or clear the filters to see everything."
        onClear={page.clearFilters}
      />
    )
  }
  return (
    <EmptyState
      icon={<ListX />}
      title="Nothing on a watchlist yet"
      description="Titles appear here once someone adds them to a Plex watchlist."
    />
  )
}
