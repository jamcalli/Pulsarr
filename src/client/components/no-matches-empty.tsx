import { SearchX } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

interface NoMatchesEmptyProps {
  title: string
  description: string
  onClear: () => void
  clearLabel?: string
  className?: string
}

export function NoMatchesEmpty({
  title,
  description,
  onClear,
  clearLabel = 'Clear filters',
  className,
}: NoMatchesEmptyProps) {
  return (
    <EmptyState
      icon={<SearchX />}
      title={title}
      description={description}
      className={className}
    >
      <Button type="button" variant="outline" onClick={onClear}>
        {clearLabel}
      </Button>
    </EmptyState>
  )
}
