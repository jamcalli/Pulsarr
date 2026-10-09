import { Fragment } from 'react'
import { Page } from '@/components/page-header'
import { Card, CardAction, CardHeader } from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'

/** `field` is a label row with its control, a radio draws its option cards below the label. */
type RowShape = 'field' | { radio: number }

interface SectionShape {
  rows: number | readonly RowShape[]
  pill?: boolean
}

function FieldRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-8 w-20" />
    </div>
  )
}

function RadioRowSkeleton({ options }: { options: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {Array.from({ length: options }, (_, option) => option).map((option) => (
        <Skeleton key={`option-${option}`} className="h-16 w-full" />
      ))}
    </div>
  )
}

function SectionSkeleton({ rows, pill = false }: SectionShape) {
  const shapes: readonly RowShape[] =
    typeof rows === 'number'
      ? Array.from({ length: rows }, () => 'field')
      : rows

  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
        {pill && (
          <CardAction>
            <Skeleton className="h-6 w-20" />
          </CardAction>
        )}
      </CardHeader>
      <FieldGroup className="gap-3.5 *:px-(--card-spacing)">
        {shapes.map((shape, row) => (
          <Fragment key={`row-${row}`}>
            {row > 0 && <FieldSeparator />}
            {shape === 'field' ? (
              <FieldRowSkeleton />
            ) : (
              <RadioRowSkeleton options={shape.radio} />
            )}
          </Fragment>
        ))}
      </FieldGroup>
    </Card>
  )
}

interface SettingsPageSkeletonProps {
  /** A count alternates three and two rows, shapes are drawn as given. */
  sections?: number | readonly SectionShape[]
  pill?: boolean
  /** Draws the section label line above the title, for pages whose header names their section. */
  sectionLabel?: boolean
}

export function SettingsPageSkeleton({
  sections = 3,
  pill = true,
  sectionLabel = false,
}: SettingsPageSkeletonProps) {
  const shapes: readonly SectionShape[] =
    typeof sections === 'number'
      ? Array.from({ length: sections }, (_, section) => ({
          rows: section % 2 === 0 ? 3 : 2,
        }))
      : sections

  return (
    <Page>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          {sectionLabel && <Skeleton className="h-5 w-20" />}
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        {pill && <Skeleton className="h-7 w-28" />}
      </div>
      {shapes.map((shape, section) => (
        <SectionSkeleton
          key={`section-${section}`}
          rows={shape.rows}
          pill={shape.pill}
        />
      ))}
    </Page>
  )
}
