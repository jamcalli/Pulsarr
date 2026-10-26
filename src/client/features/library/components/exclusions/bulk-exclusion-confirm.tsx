import { useStore } from '@tanstack/react-form'
import { useEffect } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import type { ExclusionsPage } from '@/features/library/hooks/exclusions/useExclusionsPage'
import {
  bulkExcludeCopy,
  bulkRemoveCopy,
} from '@/features/library/lib/exclusions/exclusion-copy'
import {
  bulkExcludePlan,
  bulkRemovePlan,
} from '@/features/library/lib/exclusions/exclusion-rows'
import { useAppForm } from '@/lib/form'
import type { components } from '@/types/api.js'

type ExclusionScope = components['schemas']['WatchlistExclusionScope']

const SCOPE_OPTIONS = [
  { value: 'users', label: 'Their watchlisters' },
  { value: 'global', label: 'Everyone' },
] as const satisfies Array<{ value: ExclusionScope; label: string }>

const SCOPE_DEFAULTS: { scope: ExclusionScope } = { scope: 'users' }

export function BulkExclusionConfirm({ page }: { page: ExclusionsPage }) {
  const { kind, items, open } = page.bulkConfirm
  const form = useAppForm({ defaultValues: SCOPE_DEFAULTS })
  const scope = useStore(form.store, (state) => state.values.scope)

  useEffect(() => {
    if (open) form.reset()
  }, [open, form])

  if (kind === 'remove') {
    const plan = bulkRemovePlan(items)
    const copy = bulkRemoveCopy(plan.rows, plan.ids.length)
    return (
      <ConfirmCredenza
        open={open}
        onOpenChange={(next) => {
          if (!next) page.cancelBulk()
        }}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirmLabel}
        confirmVariant={copy.variant}
        pending={page.bulkPending}
        pendingLabel={copy.pendingLabel}
        onConfirm={() => page.runBulk(scope)}
      />
    )
  }

  const { skipped } = bulkExcludePlan(items, scope)
  const copy = bulkExcludeCopy(items.length, scope, skipped)
  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={(next) => {
        if (!next) page.cancelBulk()
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      confirmVariant={copy.variant}
      confirmDisabled={skipped === items.length}
      pending={page.bulkPending}
      pendingLabel={copy.pendingLabel}
      onConfirm={() => page.runBulk(scope)}
    >
      <form.AppForm>
        <form.AppField name="scope">
          {(field) => (
            <field.RadioField
              label="Exclude for"
              options={SCOPE_OPTIONS}
              disabled={page.bulkPending}
            />
          )}
        </form.AppField>
      </form.AppForm>
      {copy.skippedLine && (
        <p className="text-muted-foreground">{copy.skippedLine}</p>
      )}
    </ConfirmCredenza>
  )
}
