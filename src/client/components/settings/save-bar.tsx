import { CircleCheck } from 'lucide-react'
import { BusyLabel } from '@/components/busy-label'
import { StickyActionBar } from '@/components/sticky-action-bar'
import { Button } from '@/components/ui/button'

interface SaveBarProps {
  dirty: boolean
  isSubmitting: boolean
  saved: boolean
  errorMessage: string | null
  onDiscard: () => void
}

export function SaveBar({
  dirty,
  isSubmitting,
  saved,
  errorMessage,
  onDiscard,
}: SaveBarProps) {
  const showSaved = saved && !dirty && !isSubmitting
  if (!dirty && !isSubmitting && !showSaved) return null

  return (
    <StickyActionBar
      mode={showSaved ? 'saved' : 'unsaved'}
      errorMessage={errorMessage}
    >
      {showSaved ? (
        <span className="flex items-center gap-2 font-bold">
          <CircleCheck className="size-4" aria-hidden />
          Changes saved
        </span>
      ) : (
        <>
          <span className="font-bold">You have unsaved changes</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={onDiscard}
            >
              Discard
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              <BusyLabel
                busy={isSubmitting}
                label="Save changes"
                busyLabel="Saving..."
              />
            </Button>
          </div>
        </>
      )}
    </StickyActionBar>
  )
}
