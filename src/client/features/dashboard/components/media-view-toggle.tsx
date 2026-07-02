import { GalleryHorizontal, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { MediaViewMode } from '@/features/dashboard/hooks/useMediaViewMode'

interface MediaViewToggleProps {
  view: MediaViewMode
  onViewChange: (view: MediaViewMode) => void
}

/** Carousel/list switch; hidden on mobile where the list is forced. */
export function MediaViewToggle({ view, onViewChange }: MediaViewToggleProps) {
  const nextView = view === 'list' ? 'carousel' : 'list'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="neutralnoShadow"
          size="icon"
          className="hidden md:inline-flex"
          onClick={() => onViewChange(nextView)}
          aria-label={`Switch to ${nextView} view`}
        >
          {view === 'list' ? (
            <GalleryHorizontal className="h-4 w-4" aria-hidden="true" />
          ) : (
            <List className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch to {nextView} view</TooltipContent>
    </Tooltip>
  )
}
