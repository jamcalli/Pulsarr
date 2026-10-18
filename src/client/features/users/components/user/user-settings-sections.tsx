import { useStore } from '@tanstack/react-form'
import { FieldRow } from '@/components/form/field-row'
import { SettingsSectionSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { UserTestRow } from '@/features/users/components/user/user-test-row'
import type { UserPageData } from '@/features/users/hooks/user/useUserPage'
import type { UserSettingsForm } from '@/features/users/hooks/user/useUserSettingsForm'
import {
  DISCORD_ID_REQUIRED,
  USER_SWITCH_LABELS,
} from '@/features/users/lib/user-switches'

interface UserSettingsSectionsProps {
  form: UserSettingsForm
  username: string
  user: UserPageData['user']
  dirty: boolean
}

export function UserSettingsSections({
  form,
  username,
  user,
  dirty,
}: UserSettingsSectionsProps) {
  const discordIdBlank = useStore(
    form.store,
    (state) => state.values.discord_id.trim() === '',
  )
  const appriseBlank = useStore(
    form.store,
    (state) => state.values.apprise.trim() === '',
  )

  return (
    <>
      <SettingsSection title="Identity">
        <FieldRow
          label="Plex username"
          description="Comes from Plex and can't be changed here."
        >
          <span className="text-muted-foreground break-all">{username}</span>
        </FieldRow>
        <form.AppField name="alias">
          {(field) => (
            <field.TextField
              label="Alias"
              description="Shown instead of their Plex username, in Pulsarr and notifications."
              type="text"
              placeholder={username}
            />
          )}
        </form.AppField>
      </SettingsSection>
      <SettingsSection
        title="Notifications"
        description="How Pulsarr tells them about their requests."
      >
        <form.AppField name="discord_id">
          {(field) => (
            <field.TextField
              label="Discord user ID"
              description="Set by /notifications in Discord, or paste it here."
              type="text"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.AppField name="notify_discord">
          {(field) => (
            <field.SwitchField
              label={USER_SWITCH_LABELS.notify_discord}
              description={
                discordIdBlank
                  ? DISCORD_ID_REQUIRED
                  : 'DMs from the Pulsarr bot, which must share a server with them.'
              }
              disabled={discordIdBlank}
            />
          )}
        </form.AppField>
        <form.AppField name="notify_discord_mention">
          {(field) => (
            <field.SwitchField
              label={USER_SWITCH_LABELS.notify_discord_mention}
              description={
                discordIdBlank
                  ? DISCORD_ID_REQUIRED
                  : '@mention them in public content posts.'
              }
              disabled={discordIdBlank}
            />
          )}
        </form.AppField>
        <form.AppField name="apprise">
          {(field) => (
            <field.SecretField
              label="Apprise URL"
              description="Where Apprise sends their notifications."
              revealLabel={{
                show: 'Show Apprise URL',
                hide: 'Hide Apprise URL',
              }}
              placeholder="mailto://, tgram://, ntfy://"
            />
          )}
        </form.AppField>
        <form.AppField name="notify_apprise">
          {(field) => (
            <field.SwitchField
              label={USER_SWITCH_LABELS.notify_apprise}
              description={
                appriseBlank
                  ? 'Add an Apprise URL to turn this on.'
                  : 'Send them notifications through your Apprise server.'
              }
              disabled={appriseBlank}
            />
          )}
        </form.AppField>
        <form.AppField name="notify_plex_mobile">
          {(field) => (
            <field.SwitchField
              label={USER_SWITCH_LABELS.notify_plex_mobile}
              description="Push to their Plex app while Plex mobile is on."
            />
          )}
        </form.AppField>
        <UserTestRow user={user} dirty={dirty} />
      </SettingsSection>
      <SettingsSection title="Access">
        <form.AppField name="can_sync">
          {(field) => (
            <field.SwitchField
              label={USER_SWITCH_LABELS.can_sync}
              description="Pulsarr watches their watchlist and requests what they add."
            />
          )}
        </form.AppField>
        <form.AppField name="requires_approval">
          {(field) => (
            <field.SwitchField
              label={USER_SWITCH_LABELS.requires_approval}
              description="Their requests wait in the approval queue until you decide."
            />
          )}
        </form.AppField>
      </SettingsSection>
    </>
  )
}

export function UserSettingsSectionsSkeleton() {
  return (
    <>
      <SettingsSectionSkeleton rows={['text', 'input']} description={false} />
      <SettingsSectionSkeleton
        rows={[
          'input',
          'switch',
          'switch',
          'input',
          'switch',
          'switch',
          'input',
        ]}
      />
      <SettingsSectionSkeleton
        rows={['switch', 'switch']}
        description={false}
      />
    </>
  )
}
