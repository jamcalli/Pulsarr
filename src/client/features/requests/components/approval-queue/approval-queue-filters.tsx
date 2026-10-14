import { useId } from 'react'
import { FilterDrawer } from '@/components/filter-drawer'
import { FilterSelect } from '@/components/filter-select'
import { SearchField } from '@/components/search-field'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { ApprovalQueuePage } from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import { useRequesterOptions } from '@/features/requests/hooks/approval-queue/useRequesterOptions'
import {
  CONTENT_TYPE_FILTER_OPTIONS,
  filterCount,
  TRIGGER_FILTER_OPTIONS,
} from '@/features/requests/lib/approval-queue/queue-state'
import { formatCount } from '@/lib/format'

interface FiltersProps {
  page: ApprovalQueuePage
}

function ClearFilters({ page }: FiltersProps) {
  if (!page.filtered) return null
  return (
    <Button type="button" variant="ghost" onClick={page.clearFilters}>
      Clear filters
    </Button>
  )
}

export function ApprovalQueueFilters({ page }: FiltersProps) {
  const requesters = useRequesterOptions()
  const { state } = page

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        label="Search titles"
        value={page.state.q}
        onValueChange={(q) => page.update({ q })}
      />
      <FilterSelect
        label="Requested by"
        value={state.user}
        options={requesters}
        onValueChange={(user) => page.update({ user })}
        className="w-42"
      />
      <FilterSelect
        label="Content type"
        value={state.type}
        options={CONTENT_TYPE_FILTER_OPTIONS}
        onValueChange={(type) => page.update({ type })}
        className="w-38"
      />
      <FilterSelect
        label="Trigger"
        value={state.trigger}
        options={TRIGGER_FILTER_OPTIONS}
        onValueChange={(trigger) => page.update({ trigger })}
        className="w-42"
      />
      <ClearFilters page={page} />
    </div>
  )
}

export function ApprovalQueuePhoneFilters({ page }: FiltersProps) {
  const requesters = useRequesterOptions()
  const id = useId()
  const { state } = page
  const count = filterCount(state)
  const showLabel =
    page.total > 0
      ? `Show ${formatCount(page.total, 'request')}`
      : 'Show results'

  return (
    <div className="flex flex-col gap-2">
      <SearchField
        label="Search titles"
        value={page.state.q}
        onValueChange={(q) => page.update({ q })}
      />
      <div className="flex items-center justify-between gap-2">
        <FilterDrawer
          count={count}
          filtered={page.filtered}
          onClear={page.clearFilters}
          closeLabel={showLabel}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={`${id}-user`}>Requested by</FieldLabel>
              <FilterSelect
                id={`${id}-user`}
                label="Requested by"
                value={state.user}
                options={requesters}
                onValueChange={(user) => page.update({ user })}
                className="w-full"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-type`}>Content type</FieldLabel>
              <FilterSelect
                id={`${id}-type`}
                label="Content type"
                value={state.type}
                options={CONTENT_TYPE_FILTER_OPTIONS}
                onValueChange={(type) => page.update({ type })}
                className="w-full"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-trigger`}>Trigger</FieldLabel>
              <FilterSelect
                id={`${id}-trigger`}
                label="Trigger"
                value={state.trigger}
                options={TRIGGER_FILTER_OPTIONS}
                onValueChange={(trigger) => page.update({ trigger })}
                className="w-full"
              />
            </Field>
          </FieldGroup>
        </FilterDrawer>
        <ClearFilters page={page} />
      </div>
    </div>
  )
}
