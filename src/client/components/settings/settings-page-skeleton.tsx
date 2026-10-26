import { cn } from 'cn'
import { Children, Fragment, type ReactNode } from 'react'
import { Page, PageHeaderSkeleton } from '@/components/page-header'
import { Card, CardAction, CardHeader } from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'

type RowControl = 'field' | 'switch' | 'input' | 'text'

/** A control kind is a label row with that control, a radio draws its option cards below the label. */
type RowShape = RowControl | { radio: number }

interface SectionShape {
  rows: number | readonly RowShape[]
  pill?: boolean
  description?: boolean
}

const CONTROL_CLASSES: Record<RowControl, string> = {
  field: 'h-8 w-20 shrink-0',
  switch: 'h-6 w-11 shrink-0',
  input: 'h-10 w-full @lg/field-group:w-auto @lg/field-group:basis-72',
  text: 'h-5 w-32 shrink-0',
}

export function FieldRowSkeleton({
  control = 'field',
  description = true,
  action = false,
}: {
  control?: RowControl
  description?: boolean
  /** Mirrors a `TextField` with an action beside its input. */
  action?: boolean
}) {
  return (
    <div
      className={cn(
        'flex gap-3',
        control === 'switch'
          ? 'flex-row items-start'
          : 'flex-col @lg/field-group:flex-row @lg/field-group:items-start',
      )}
    >
      <div className="flex flex-1 flex-col gap-1">
        <Skeleton className="h-4 w-40" />
        {description && <Skeleton className="h-4 w-72 max-w-full" />}
      </div>
      {action ? (
        <div className="flex w-full gap-2 @lg/field-group:w-auto @lg/field-group:basis-96">
          <Skeleton className="h-10 min-w-0 flex-1" />
          <Skeleton className="h-10 w-28 shrink-0" />
        </div>
      ) : (
        <Skeleton className={CONTROL_CLASSES[control]} />
      )}
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

function rowShapes(rows: SectionShape['rows']): readonly RowShape[] {
  return typeof rows === 'number'
    ? Array.from({ length: rows }, () => 'field')
    : rows
}

function shapeRow(shape: RowShape) {
  return typeof shape === 'string' ? (
    <FieldRowSkeleton control={shape} />
  ) : (
    <RadioRowSkeleton options={shape.radio} />
  )
}

type SettingsSectionSkeletonProps = Omit<SectionShape, 'rows'> &
  (
    | { rows: SectionShape['rows']; children?: never }
    | { rows?: never; children: ReactNode }
  )

/** Rows mirror SettingsSection, so each child is one row with a separator before it. */
export function SettingsSectionSkeleton({
  rows,
  pill = false,
  description = true,
  children,
}: SettingsSectionSkeletonProps) {
  const rowNodes =
    rows === undefined
      ? Children.toArray(children)
      : rowShapes(rows).map(shapeRow)

  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        {description && <Skeleton className="h-4 w-64 max-w-full" />}
        {pill && (
          <CardAction>
            <Skeleton className="h-6 w-20" />
          </CardAction>
        )}
      </CardHeader>
      <FieldGroup className="gap-3.5 *:px-(--card-spacing)">
        {rowNodes.map((row, index) => (
          <Fragment key={`row-${index}`}>
            {index > 0 && <FieldSeparator />}
            {row}
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
      <PageHeaderSkeleton
        section={sectionLabel}
        action={pill && <Skeleton className="h-7 w-28" />}
      />
      {shapes.map((shape, section) => (
        <SettingsSectionSkeleton
          key={`section-${section}`}
          rows={shape.rows}
          pill={shape.pill}
          description={shape.description}
        />
      ))}
    </Page>
  )
}
