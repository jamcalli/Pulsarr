import { cn } from 'cn'
import { GalleryHorizontal, List } from 'lucide-react'
import type { ReactNode } from 'react'
import { SegmentedControl } from '@/components/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import type { MediaView } from '@/lib/request-list-prefs'

const VIEW_OPTIONS = [
  {
    value: 'carousel',
    label: <GalleryHorizontal />,
    ariaLabel: 'Poster view',
  },
  { value: 'list', label: <List />, ariaLabel: 'List view' },
] as const satisfies ReadonlyArray<{
  value: MediaView
  label: ReactNode
  ariaLabel: string
}>

interface ViewToggleProps {
  value: MediaView
  onValueChange: (view: MediaView) => void
  className?: string
}

export function ViewToggle({
  value,
  onValueChange,
  className,
}: ViewToggleProps) {
  return (
    <div className={cn('ml-auto', className)}>
      <SegmentedControl
        aria-label="View"
        value={value}
        options={VIEW_OPTIONS}
        onValueChange={onValueChange}
      />
    </div>
  )
}

export function ViewToggleSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('ml-auto h-8 w-18', className)} />
}
