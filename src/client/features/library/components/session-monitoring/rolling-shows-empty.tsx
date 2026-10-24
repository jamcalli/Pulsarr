import { CircleCheck, Tv } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { NoMatchesEmpty } from '@/components/no-matches-empty'
import { Button } from '@/components/ui/button'
import type { SessionMonitoringPage } from '@/features/library/hooks/session-monitoring/useSessionMonitoringPage'
import { noInactiveDescription } from '@/features/library/lib/session-monitoring/session-monitoring-copy'

interface RollingShowsEmptyProps {
  page: SessionMonitoringPage
  inactivityDays: number
}

export function NoRollingShowsEmpty({ onManage }: { onManage: () => void }) {
  return (
    <EmptyState
      icon={<Tv />}
      title="No rolling shows yet"
      description="Enroll shows here, or through a Sonarr instance or content route."
    >
      <Button type="button" variant="outline" onClick={onManage}>
        Manage enrollment
      </Button>
    </EmptyState>
  )
}

export function RollingShowsNoResults({
  page,
  inactivityDays,
}: RollingShowsEmptyProps) {
  const { state } = page
  const onlyInactive =
    state.status === 'inactive' && state.mode === null && state.q.trim() === ''

  if (onlyInactive) {
    return (
      <EmptyState
        icon={<CircleCheck />}
        title="No inactive shows"
        description={noInactiveDescription(inactivityDays)}
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => page.update({ status: null })}
        >
          Show all
        </Button>
      </EmptyState>
    )
  }
  return (
    <NoMatchesEmpty
      title="No shows match these filters"
      description="Try another title, or clear the filters."
      onClear={page.clearFilters}
    />
  )
}
