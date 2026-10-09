import { cn } from 'cn'
import type { ReactNode } from 'react'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

const BAR_CLASS =
  'flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-border px-4 py-3 shadow-shadow'

type StickyActionBarMode =
  | { mode: 'unsaved' | 'saved' }
  | { mode: 'selection'; count: number; onClearSelection: () => void }

type StickyActionBarProps = StickyActionBarMode & {
  errorMessage?: string | null
  errorDetail?: string | null
  children: ReactNode
}

/** In selection mode `children` are the page's actions, otherwise the whole bar content. */
export function StickyActionBar(props: StickyActionBarProps) {
  const { errorMessage = null, errorDetail = null, children } = props

  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-2">
      <ErrorAlert message={errorMessage} detail={errorDetail} />
      {props.mode === 'selection' ? (
        <section
          aria-label="Selection"
          className={cn(
            BAR_CLASS,
            'bg-card text-foreground max-md:flex-col max-md:items-stretch',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold tabular-nums">
              {formatNumber(props.count)} selected
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={props.onClearSelection}
            >
              Clear selection
            </Button>
          </div>
          <div className="flex gap-2 max-md:*:h-10 max-md:*:flex-1 max-md:*:text-sm">
            {children}
          </div>
        </section>
      ) : (
        <div
          role="status"
          className={cn(
            BAR_CLASS,
            'text-primary-foreground',
            props.mode === 'saved' ? 'bg-ok' : 'bg-gold',
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}
