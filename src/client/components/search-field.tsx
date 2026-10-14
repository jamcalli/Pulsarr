import { cn } from 'cn'
import { Search } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'

const SEARCH_FIELD_SIZE = 'md:max-w-90 md:grow md:basis-60'

interface SearchFieldProps {
  /** The placeholder and the accessible name. */
  label: string
  value: string
  onValueChange: (value: string) => void
  className?: string
}

export function SearchField({
  label,
  value,
  onValueChange,
  className,
}: SearchFieldProps) {
  return (
    <InputGroup className={cn(SEARCH_FIELD_SIZE, className)}>
      <InputGroupAddon align="inline-start">
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        placeholder={label}
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </InputGroup>
  )
}

export function SearchFieldSkeleton() {
  return <Skeleton className={cn('h-10', SEARCH_FIELD_SIZE)} />
}
