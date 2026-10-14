import { SEASON_MONITORING_LABELS } from '@root/schemas/sonarr/season-monitoring.schema'
import { useStore } from '@tanstack/react-form'
import { Tv } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BulkFormCredenza } from '@/components/bulk-form-credenza'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { DataTable } from '@/components/data-table/data-table'
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton'
import { EmptyState } from '@/components/empty-state'
import { ErrorAlert } from '@/components/error-alert'
import { FieldSection } from '@/components/field-section'
import { FilterSelect } from '@/components/filter-select'
import { RetryAlert } from '@/components/retry-alert'
import { SearchField } from '@/components/search-field'
import { SaveBar } from '@/components/settings/save-bar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ENROLLMENT_COLUMN_CLASSES,
  ENROLLMENT_COLUMNS,
} from '@/features/library/components/session-monitoring/enrollment-columns'
import type { Enrollment } from '@/features/library/hooks/session-monitoring/useEnrollment'
import {
  ENROLLMENT_DEFAULTS,
  type EnrollmentValues,
  enrollableId,
} from '@/features/library/lib/session-monitoring/enrollment'
import {
  ROLLING_MODE_HELP,
  ROLLING_MODE_OPTIONS,
} from '@/features/library/lib/session-monitoring/rolling-labels'
import {
  enrollmentFailure,
  enrollmentSummary,
  startOverCopy,
} from '@/features/library/lib/session-monitoring/session-monitoring-copy'
import { useAppForm } from '@/lib/form'
import { formatCount, formatNumber } from '@/lib/format'

const TITLE = 'Manage enrollment'
const DESCRIPTION = 'Choose shows Pulsarr sent to Sonarr and how they roll.'
const SKELETON_ROWS = ['row-1', 'row-2', 'row-3', 'row-4'] as const
const TOOLBAR = 'flex flex-wrap items-center gap-2'

const CHOOSE_MODE = 'Choose a rolling mode'

function footerMessage(values: EnrollmentValues, shows: string): string {
  if (values.mode === null) return CHOOSE_MODE
  if (shows === '') return 'Select shows to apply it to'
  if (values.startOver) return `Starts ${shows} over, deleting files`
  return `${shows}, ${SEASON_MONITORING_LABELS[values.mode].toLowerCase()}`
}

function EnrollmentList({ enrollment }: { enrollment: Enrollment }) {
  const { rows, filter } = enrollment
  const selectedCount = enrollment.selected.length

  if (enrollment.loadError) {
    return (
      <RetryAlert message={enrollment.loadError} onRetry={enrollment.retry} />
    )
  }
  if (rows === null) {
    return (
      <DataTableSkeleton
        columns={ENROLLMENT_COLUMNS}
        columnClasses={ENROLLMENT_COLUMN_CLASSES}
        rows={SKELETON_ROWS}
        cell={() => <Skeleton className="h-4 w-24" />}
      />
    )
  }

  const countLine =
    selectedCount > 0
      ? `${formatCount(rows.length, 'show')}, ${formatNumber(selectedCount)} selected`
      : formatCount(rows.length, 'show')
  const table =
    rows.length > 0 ? (
      <DataTable
        label="Shows sent to Sonarr"
        columns={ENROLLMENT_COLUMNS}
        columnClasses={ENROLLMENT_COLUMN_CLASSES}
        data={rows}
        getRowId={(row) => enrollableId(row.show)}
        rowName={(row) => row.show.title}
        sorting={[]}
        onSortingChange={() => undefined}
        rowSelection={enrollment.selection}
        onRowSelectionChange={enrollment.setSelection}
        frozen={enrollment.pending}
      />
    ) : (
      <p className="text-muted-foreground">
        No shows match. Try another title or instance.
      </p>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className={TOOLBAR}>
        <SearchField
          label="Search by title"
          value={filter.q}
          onValueChange={(q) => enrollment.updateFilter({ q })}
        />
        <FilterSelect
          label="Instance"
          value={filter.instanceId}
          options={enrollment.instanceOptions}
          onValueChange={(instanceId) =>
            enrollment.updateFilter({ instanceId })
          }
          className="w-44 max-md:w-full"
        />
      </div>
      <p className="text-muted-foreground">{countLine}</p>
      {table}
    </div>
  )
}

function EnrollmentResult({ enrollment }: { enrollment: Enrollment }) {
  const { result } = enrollment
  if (!result) return null
  const failure = result.failed > 0 ? enrollmentFailure(result.failed) : null

  return (
    <div role="status" className="flex flex-col gap-3">
      <p className="font-medium">
        {enrollmentSummary(result.total, result.failed)}
      </p>
      <ErrorAlert
        message={failure}
        detail="Run it again. Shows already changed are skipped."
      />
    </div>
  )
}

export function EnrollmentCredenza({ enrollment }: { enrollment: Enrollment }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const form = useAppForm({
    defaultValues: ENROLLMENT_DEFAULTS,
    onSubmit: ({ value }) => {
      if (value.mode === null || enrollment.selected.length === 0) return
      if (value.startOver) {
        setConfirmOpen(true)
        return
      }
      enrollment.apply(value.mode, false)
    },
  })
  const values = useStore(form.store, (state) => state.values)

  useEffect(() => {
    if (!enrollment.open) setConfirmOpen(false)
  }, [enrollment.open])

  const count = enrollment.selected.length
  const shows = count > 0 ? formatCount(count, 'show') : ''
  const nothingSent = enrollment.shows !== null && enrollment.shows.length === 0
  const close = () => enrollment.setOpen(false)
  const applyLabel = values.startOver
    ? `Start over ${shows}`
    : `Apply to ${shows}`
  const modeHelp = values.mode
    ? ROLLING_MODE_HELP[values.mode]
    : 'How the selected shows start and grow.'
  const titles = enrollment.selected.map((show) => show.title)
  const [what, lost] = values.mode
    ? startOverCopy(titles, values.mode)
    : ['', '']

  const closeButton = (
    <Button
      type="button"
      variant="outline"
      className="sm:self-end"
      onClick={close}
    >
      Close
    </Button>
  )
  const resultFooter = (
    <div className="flex gap-2 sm:self-end">
      <Button type="button" variant="outline" onClick={enrollment.backToList}>
        Back to the list
      </Button>
      <Button type="button" onClick={close}>
        Close
      </Button>
    </div>
  )
  const touched = count > 0 || values.mode !== null
  const ready = count > 0 && values.mode !== null
  const listFooter = touched ? (
    <SaveBar
      dirty
      isSubmitting={enrollment.pending && !values.startOver}
      saved={false}
      errorMessage={values.startOver ? null : enrollment.errorMessage}
      onDiscard={close}
      message={footerMessage(values, shows)}
      saveLabel={ready ? applyLabel : 'Apply'}
      saveDisabled={!ready}
      discardLabel="Cancel"
    />
  ) : (
    closeButton
  )

  const body = nothingSent ? (
    <EmptyState
      icon={<Tv />}
      title="No shows sent to Sonarr yet"
      description="Shows appear here once Pulsarr sends them to Sonarr."
    />
  ) : enrollment.result ? (
    <EnrollmentResult enrollment={enrollment} />
  ) : (
    <>
      <FieldSection
        title="Apply to the selection"
        description="Enrolled shows keep their progress unless you start over."
      >
        <form.AppField name="mode">
          {(field) => (
            <field.SelectField
              label="Rolling mode"
              description={modeHelp}
              placeholder="Choose a mode"
              options={ROLLING_MODE_OPTIONS}
              disabled={enrollment.pending}
              error={count > 0 && values.mode === null ? CHOOSE_MODE : null}
            />
          )}
        </form.AppField>
        <form.AppField name="startOver">
          {(field) => (
            <field.SwitchField
              label="Start over from the beginning"
              description="Unmonitors every episode and deletes files beyond the mode's start."
              disabled={enrollment.pending}
            />
          )}
        </form.AppField>
      </FieldSection>
      <EnrollmentList enrollment={enrollment} />
    </>
  )
  const footer = nothingSent
    ? closeButton
    : enrollment.result
      ? resultFooter
      : listFooter

  return (
    <>
      <BulkFormCredenza
        open={enrollment.open}
        onOpenChange={enrollment.setOpen}
        form={form}
        title={TITLE}
        description={DESCRIPTION}
        footer={footer}
      >
        {body}
      </BulkFormCredenza>
      <ConfirmCredenza
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Start over ${shows}`}
        description={what}
        confirmLabel={`Start over ${shows}`}
        confirmVariant="destructive"
        pending={enrollment.pending}
        pendingLabel="Applying..."
        errorMessage={enrollment.errorMessage}
        onConfirm={() => {
          if (values.mode === null) return
          enrollment.apply(values.mode, true, () => setConfirmOpen(false))
        }}
      >
        <p className="text-muted-foreground">{lost}</p>
      </ConfirmCredenza>
    </>
  )
}
