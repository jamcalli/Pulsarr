import { SearchX } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

interface NoMatchesEmptyProps {
  title: string
  description: string
  onClear: () => void
  className?: string
}

export function NoMatchesEmpty({
  title,
  description,
  onClear,
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
        Clear filters
      </Button>
    </EmptyState>
  )
}
