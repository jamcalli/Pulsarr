import { useStore } from '@tanstack/react-form'
import { BulkFormCredenza } from '@/components/bulk-form-credenza'
import { FieldSection } from '@/components/field-section'
import type { PlexUsersPage } from '@/features/users/hooks/plex-users/usePlexUsersPage'
import {
  BULK_CHOICE_OPTIONS,
  BULK_SETTINGS_DEFAULTS,
  bulkSettingsChangeCount,
  bulkSettingsUpdates,
} from '@/features/users/lib/plex-users/bulk-actions'
import { USER_SWITCH_LABELS } from '@/features/users/lib/user-switches'
import { useAppForm } from '@/lib/form'
import { formatCount } from '@/lib/format'

export function BulkSettingsCredenza({ page }: { page: PlexUsersPage }) {
  const users = formatCount(page.selected.length, 'user')
  const busy = page.bulkPending
  const form = useAppForm({
    defaultValues: BULK_SETTINGS_DEFAULTS,
    onSubmit: ({ value }) =>
      page.runBulk({
        kind: 'settings',
        userIds: page.selected.map((row) => row.user.id),
        updates: bulkSettingsUpdates(value),
      }),
  })
  const changes = useStore(form.store, (state) =>
    bulkSettingsChangeCount(state.values),
  )

  const dirty = changes > 0

  return (
    <BulkFormCredenza
      open={page.settingsOpen}
      onOpenChange={page.setSettingsOpen}
      form={form}
      title={`Edit settings for ${users}`}
      description="Fields left as is keep each user's current value."
      dirty={dirty}
      busy={busy}
      saveBar={{
        message: `${formatCount(changes, 'change')} for ${users}`,
        saveLabel: `Apply to ${users}`,
      }}
    >
      <FieldSection title="Notifications">
        <form.AppField name="notify_discord">
          {(field) => (
            <field.SegmentedField
              label={USER_SWITCH_LABELS.notify_discord}
              description="Users without a Discord user ID stay off."
              options={BULK_CHOICE_OPTIONS}
              disabled={busy}
            />
          )}
        </form.AppField>
        <form.AppField name="notify_discord_mention">
          {(field) => (
            <field.SegmentedField
              label={USER_SWITCH_LABELS.notify_discord_mention}
              description="Only works for users with a Discord user ID."
              options={BULK_CHOICE_OPTIONS}
              disabled={busy}
            />
          )}
        </form.AppField>
        <form.AppField name="notify_apprise">
          {(field) => (
            <field.SegmentedField
              label={USER_SWITCH_LABELS.notify_apprise}
              description="Users without an Apprise URL stay off."
              options={BULK_CHOICE_OPTIONS}
              disabled={busy}
            />
          )}
        </form.AppField>
        <form.AppField name="notify_plex_mobile">
          {(field) => (
            <field.SegmentedField
              label={USER_SWITCH_LABELS.notify_plex_mobile}
              options={BULK_CHOICE_OPTIONS}
              disabled={busy}
            />
          )}
        </form.AppField>
      </FieldSection>
      <FieldSection title="Access">
        <form.AppField name="can_sync">
          {(field) => (
            <field.SegmentedField
              label={USER_SWITCH_LABELS.can_sync}
              options={BULK_CHOICE_OPTIONS}
              disabled={busy}
            />
          )}
        </form.AppField>
        <form.AppField name="requires_approval">
          {(field) => (
            <field.SegmentedField
              label={USER_SWITCH_LABELS.requires_approval}
              options={BULK_CHOICE_OPTIONS}
              disabled={busy}
            />
          )}
        </form.AppField>
      </FieldSection>
      <FieldSection
        title="Clear values"
        description="Removes the value from every selected user."
      >
        <form.AppField name="clearAlias">
          {(field) => (
            <field.SwitchField
              label="Clear alias"
              description="They show by Plex username again."
              disabled={busy}
            />
          )}
        </form.AppField>
        <form.AppField name="clearDiscordId">
          {(field) => (
            <field.SwitchField
              label="Clear Discord user ID"
              description="Also turns Discord off for them."
              disabled={busy}
            />
          )}
        </form.AppField>
        <form.AppField name="clearApprise">
          {(field) => (
            <field.SwitchField
              label="Clear Apprise URL"
              description="Also turns Apprise off for them."
              disabled={busy}
            />
          )}
        </form.AppField>
      </FieldSection>
    </BulkFormCredenza>
  )
}
