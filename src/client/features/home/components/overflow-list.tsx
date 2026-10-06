import type { ReactNode } from 'react'
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from '@/components/credenza'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VISIBLE_ROWS } from '@/features/home/lib/ranked-rows'

interface OverflowListProps<T> {
  rows: T[]
  visible?: number
  summary: (hidden: T[]) => string
  title: string
  description: string
  renderRows: (rows: T[]) => ReactNode
}

export function OverflowList<T>({
  rows,
  visible = VISIBLE_ROWS,
  summary,
  title,
  description,
  renderRows,
}: OverflowListProps<T>) {
  const hidden = rows.slice(visible)

  return (
    <>
      {renderRows(rows.slice(0, visible))}
      {hidden.length > 0 && (
        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{summary(hidden)}</span>
          <Credenza>
            <CredenzaTrigger render={<Button variant="neutral" size="sm" />}>
              View all
            </CredenzaTrigger>
            <CredenzaContent className="md:max-w-2xl">
              <CredenzaHeader>
                <CredenzaTitle>{title}</CredenzaTitle>
                <CredenzaDescription>{description}</CredenzaDescription>
              </CredenzaHeader>
              <CredenzaBody className="flex min-h-0 flex-col gap-4 overflow-y-auto">
                {renderRows(rows)}
              </CredenzaBody>
            </CredenzaContent>
          </Credenza>
        </div>
      )}
    </>
  )
}

export function OverflowSummarySkeleton() {
  return (
    <div className="mt-auto flex items-center justify-between gap-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-20" />
    </div>
  )
}
