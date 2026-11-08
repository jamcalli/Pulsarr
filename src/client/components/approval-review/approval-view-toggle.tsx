import { SegmentedControl } from '@/components/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { CONTENT_TYPE_LABELS } from '@/lib/content-type'
import type { components } from '@/types/api.js'

type ContentType = components['schemas']['ContentType']

export type ApprovalView = 'review' | 'info'

interface ApprovalViewToggleProps {
  type: ContentType
  value: ApprovalView
  onValueChange: (view: ApprovalView) => void
}

export function ApprovalViewToggle({
  type,
  value,
  onValueChange,
}: ApprovalViewToggleProps) {
  const options = [
    { value: 'review', label: 'Review' },
    { value: 'info', label: `${CONTENT_TYPE_LABELS[type]} info` },
  ] as const

  return (
    <div className="flex">
      <SegmentedControl
        aria-label="View"
        value={value}
        options={options}
        onValueChange={onValueChange}
      />
    </div>
  )
}

export function ApprovalViewToggleSkeleton() {
  return <Skeleton className="h-8 w-40" />
}
