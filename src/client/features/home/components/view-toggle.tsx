import { GalleryHorizontal, List } from 'lucide-react'
import type { ReactNode } from 'react'
import { SegmentedControl } from '@/components/segmented-control'
import type { MediaView } from '@/features/home/lib/home-prefs'

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
}

export function ViewToggle({ value, onValueChange }: ViewToggleProps) {
  return (
    <div className="ml-auto hidden md:block">
      <SegmentedControl
        aria-label="View"
        value={value}
        options={VIEW_OPTIONS}
        onValueChange={onValueChange}
      />
    </div>
  )
}
