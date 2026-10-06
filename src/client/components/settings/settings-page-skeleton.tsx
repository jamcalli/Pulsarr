import { Fragment } from 'react'
import { Page } from '@/components/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </CardHeader>
      <FieldGroup className="gap-3.5 *:px-(--card-spacing)">
        {Array.from({ length: rows }, (_, row) => row).map((row) => (
          <Fragment key={`row-${row}`}>
            {row > 0 && <FieldSeparator />}
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          </Fragment>
        ))}
      </FieldGroup>
    </Card>
  )
}

export function SettingsPageSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <Page>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-7 w-28" />
      </div>
      {Array.from({ length: sections }, (_, section) => section).map(
        (section) => (
          <SectionSkeleton
            key={`section-${section}`}
            rows={section % 2 === 0 ? 3 : 2}
          />
        ),
      )}
    </Page>
  )
}
