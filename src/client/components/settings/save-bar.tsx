import { cn } from 'cn'
import { CircleCheck, Loader2 } from 'lucide-react'
import { ErrorAlert } from '@/components/error-alert'
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
    <div className="sticky bottom-4 z-10 flex flex-col gap-2">
      <ErrorAlert message={errorMessage} />
      <div
        role="status"
        className={cn(
          'flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-border px-4 py-3 text-primary-foreground shadow-shadow',
          showSaved ? 'bg-ok' : 'bg-gold',
        )}
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
                {isSubmitting ? (
                  <>
                    <Loader2
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                    Saving...
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
