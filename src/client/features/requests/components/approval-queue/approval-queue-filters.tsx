import { Search } from 'lucide-react'
import { useId, useState } from 'react'
import {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/credenza'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { FilterSelect } from '@/features/requests/components/approval-queue/filter-select'
import type { ApprovalQueuePage } from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import { useRequesterOptions } from '@/features/requests/hooks/approval-queue/useRequesterOptions'
import {
  CONTENT_TYPE_FILTER_OPTIONS,
  filterCount,
  TRIGGER_FILTER_OPTIONS,
} from '@/features/requests/lib/approval-queue/queue-state'
import { formatCount, formatNumber } from '@/lib/format'

interface FiltersProps {
  page: ApprovalQueuePage
}

function SearchField({ page }: FiltersProps) {
  return (
    <InputGroup className="md:max-w-90 md:grow md:basis-60">
      <InputGroupAddon align="inline-start">
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        placeholder="Search titles"
        aria-label="Search titles"
        value={page.state.q}
        onChange={(event) => page.update({ q: event.target.value })}
      />
    </InputGroup>
  )
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
      <SearchField page={page} />
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
  const [open, setOpen] = useState(false)
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
      <SearchField page={page} />
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Filters
          {count > 0 && (
            <Badge variant="secondary">{formatNumber(count)}</Badge>
          )}
        </Button>
        <ClearFilters page={page} />
      </div>
      <Credenza open={open} onOpenChange={setOpen}>
        <CredenzaContent>
          <CredenzaHeader>
            <CredenzaTitle>Filters</CredenzaTitle>
          </CredenzaHeader>
          <CredenzaBody>
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
          </CredenzaBody>
          <CredenzaFooter>
            <Button
              type="button"
              variant="outline"
              disabled={!page.filtered}
              onClick={page.clearFilters}
            >
              Clear filters
            </Button>
            <CredenzaClose render={<Button type="button" />}>
              {showLabel}
            </CredenzaClose>
          </CredenzaFooter>
        </CredenzaContent>
      </Credenza>
    </div>
  )
}
