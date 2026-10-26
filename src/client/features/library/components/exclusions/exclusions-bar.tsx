import { StickyActionBar } from '@/components/sticky-action-bar'
import { Button } from '@/components/ui/button'
import type { ExclusionsPage } from '@/features/library/hooks/exclusions/useExclusionsPage'

export function ExclusionsBar({ page }: { page: ExclusionsPage }) {
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
      {page.canRemove && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => page.openBulk('remove')}
        >
          Remove
        </Button>
      )}
      <Button type="button" size="sm" onClick={() => page.openBulk('exclude')}>
        Exclude
      </Button>
    </StickyActionBar>
  )
}
