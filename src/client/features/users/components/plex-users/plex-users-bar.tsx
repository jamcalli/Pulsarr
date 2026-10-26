import { StickyActionBar } from '@/components/sticky-action-bar'
import { Button } from '@/components/ui/button'
import type { PlexUsersPage } from '@/features/users/hooks/plex-users/usePlexUsersPage'

export function PlexUsersBar({ page }: { page: PlexUsersPage }) {
  const count = page.selected.length
  if (count === 0) return null

  return (
    <StickyActionBar
      mode="selection"
      count={count}
      onClearSelection={page.clearSelection}
      errorMessage={page.failure?.message}
      errorDetail={page.failure?.detail}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={page.openQuotas}
      >
        Edit quotas
      </Button>
      <Button type="button" size="sm" onClick={page.openSettings}>
        Edit settings
      </Button>
    </StickyActionBar>
  )
}
