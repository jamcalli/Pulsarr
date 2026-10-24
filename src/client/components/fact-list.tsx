import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

const GRID = 'grid grid-cols-2 gap-x-4 gap-y-3'

interface FactListProps {
  facts: ReadonlyArray<{ label: string; value: ReactNode }>
}

export function FactList({ facts }: FactListProps) {
  return (
    <dl className={GRID}>
      {facts.map((fact) => (
        <div key={fact.label} className="flex min-w-0 flex-col">
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="break-words">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function FactListSkeleton({ rows }: { rows: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: rows }, (_, row) => `fact-${row}`).map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-28 max-w-full" />
        </div>
      ))}
    </div>
  )
}
