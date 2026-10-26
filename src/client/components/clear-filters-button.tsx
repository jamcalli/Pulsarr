import { Button } from '@/components/ui/button'

interface ClearFiltersButtonProps {
  filtered: boolean
  onClear: () => void
}

export function ClearFiltersButton({
  filtered,
  onClear,
}: ClearFiltersButtonProps) {
  if (!filtered) return null
  return (
    <Button type="button" variant="ghost" onClick={onClear}>
      Clear filters
    </Button>
  )
}
