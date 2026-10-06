import type { ReactNode } from 'react'

interface FactListProps {
  facts: ReadonlyArray<{ label: string; value: ReactNode }>
}

export function FactList({ facts }: FactListProps) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {facts.map((fact) => (
        <div key={fact.label} className="flex min-w-0 flex-col">
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="break-words">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
