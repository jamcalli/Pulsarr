import { useStore } from '@tanstack/react-form'
import { useEffect, useState } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { SaveBar } from '@/components/settings/save-bar'
import { FieldSection } from '@/features/users/components/field-section'
import { BulkFormCredenza } from '@/features/users/components/plex-users/bulk-form-credenza'
import { QuotaFields } from '@/features/users/components/quota-fields'
import type { PlexUsersPage } from '@/features/users/hooks/plex-users/usePlexUsersPage'
import {
  BULK_QUOTA_ACTION_OPTIONS,
  BULK_QUOTA_DEFAULTS,
  blankBulkQuotaField,
  bulkQuotaPayload,
} from '@/features/users/lib/plex-users/bulk-actions'
import {
  BLANK_QUOTA_MESSAGES,
  QUOTA_REMOVAL_DESCRIPTION,
} from '@/features/users/lib/quota-fields'
import { useAppForm } from '@/lib/form'
import { formatCount } from '@/lib/format'

export function BulkQuotaCredenza({ page }: { page: PlexUsersPage }) {
  const users = formatCount(page.selected.length, 'user')
  const busy = page.bulkPending
  const [confirmOpen, setConfirmOpen] = useState(false)
  const form = useAppForm({
    defaultValues: BULK_QUOTA_DEFAULTS,
    onSubmit: ({ value }) => {
      if (value.action === 'clear') {
        setConfirmOpen(true)
        return
      }
      page.runBulk({
        kind: 'quotas',
        payload: bulkQuotaPayload(
          value,
          page.selected.map((row) => row.user.id),
        ),
      })
    },
  })
  const action = useStore(form.store, (state) => state.values.action)
  const blankField = useStore(form.store, (state) =>
    blankBulkQuotaField(state.values),
  )

  useEffect(() => {
    if (!page.quotasOpen) setConfirmOpen(false)
  }, [page.quotasOpen])

  const clearing = action === 'clear'
  const saveMessage = blankField
    ? BLANK_QUOTA_MESSAGES[blankField]
    : clearing
      ? `Removes quotas for ${users}`
      : `Ready for ${users}`

  return (
    <>
      <BulkFormCredenza
        open={page.quotasOpen}
        onOpenChange={page.setQuotasOpen}
        form={form}
        title={`Edit quotas for ${users}`}
        description="Replaces the quotas of every selected user."
        footer={
          <SaveBar
            dirty
            isSubmitting={busy && !clearing}
            saved={false}
            errorMessage={null}
            onDiscard={() => page.setQuotasOpen(false)}
            message={saveMessage}
            saveLabel={clearing ? 'Remove quotas' : `Apply to ${users}`}
            saveDisabled={blankField !== null}
            discardLabel="Cancel"
          />
        }
      >
        <form.AppField name="action">
          {(field) => (
            <field.SegmentedField
              label="Action"
              labelHidden
              options={BULK_QUOTA_ACTION_OPTIONS}
              disabled={busy}
            />
          )}
        </form.AppField>
        {clearing ? (
          <p className="text-muted-foreground">
            Removes the movie and show quotas of every selected user.
          </p>
        ) : (
          <>
            <FieldSection title="Movies">
              <QuotaFields
                form={form}
                fields="movie"
                unit="movie"
                disabled={busy}
              />
            </FieldSection>
            <FieldSection title="Shows">
              <QuotaFields
                form={form}
                fields="show"
                unit="show"
                disabled={busy}
              />
            </FieldSection>
          </>
        )}
      </BulkFormCredenza>
      <ConfirmCredenza
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove quotas for ${users}?`}
        description={QUOTA_REMOVAL_DESCRIPTION}
        confirmLabel="Remove quotas"
        confirmVariant="destructive"
        pending={busy}
        pendingLabel="Removing..."
        onConfirm={() =>
          page.runBulk({
            kind: 'quotas',
            payload: bulkQuotaPayload(
              form.state.values,
              page.selected.map((row) => row.user.id),
            ),
          })
        }
      />
    </>
  )
}
