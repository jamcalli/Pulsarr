import { TAG_PREFIX_DEFAULTS } from '@root/schemas/shared/prefix-validation.schema'
import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { RetryAlert } from '@/components/retry-alert'
import { ActionsSection } from '@/components/settings/actions-section'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { Button } from '@/components/ui/button'
import { EnabledPill } from '@/features/users/components/enabled-pill'
import { NamingFormatSection } from '@/features/users/components/naming-format-section'
import { RemoveTagsDialog } from '@/features/users/components/user-tags/remove-tags-dialog'
import {
  type TagActionId,
  useTagActions,
} from '@/features/users/hooks/user-tags/useTagActions'
import { useTagStatus } from '@/features/users/hooks/user-tags/useTagStatus'
import { useUserTagsForm } from '@/features/users/hooks/user-tags/useUserTagsForm'
import {
  type SyncActionCopy,
  syncActionSpecs,
} from '@/features/users/lib/sync-actions'
import { USER_TAGS_SKELETON } from '@/features/users/lib/user-tags-skeleton'
import { useConfig } from '@/hooks/useConfig'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useShowLoading } from '@/hooks/useMinLoading'
import { formatCount } from '@/lib/format'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Users'
const TITLE = NAV_PAGES.userTags.label
const DESCRIPTION = 'Tag content in Sonarr and Radarr by who requested it.'

const NAMING_FIELDS = {
  prefix: 'tagPrefix',
  namingSource: 'tagNamingSource',
} as const

const ACTION_ROWS: SyncActionCopy<TagActionId>[] = [
  {
    id: 'sync',
    title: 'Sync tags',
    description:
      'Tag everything currently on a watchlist and clear tags that no longer apply.',
    buttonLabel: 'Sync',
    busyLabel: 'Syncing...',
  },
  {
    id: 'create',
    title: 'Create missing tags',
    description:
      "Adds a tag in each instance for any user who doesn't have one yet.",
    buttonLabel: 'Create',
    busyLabel: 'Creating...',
  },
  {
    id: 'cleanup',
    title: 'Clean up orphaned tags',
    description:
      'Deletes tags left behind by users who were removed or renamed.',
    buttonLabel: 'Clean up',
    busyLabel: 'Cleaning...',
  },
  {
    id: 'remove',
    title: 'Remove all user tags',
    description: 'Undo tagging everywhere.',
    buttonLabel: 'Remove',
    busyLabel: 'Removing...',
  },
]

const REMOVED_TAG_OPTIONS = [
  { value: 'remove', label: 'Remove the tag' },
  {
    value: 'keep',
    label: 'Keep the tag',
    description: 'The tag stays as a record of who asked.',
  },
  {
    value: 'special-tag',
    label: 'Swap for a removed tag',
    description:
      "The user's tag comes off and a marker tag goes on, so you can find leftovers.",
  },
] as const satisfies Array<{
  value: string
  label: string
  description?: string
}>

function UserTagsSettings({
  config,
}: {
  config: components['schemas']['Config']
}) {
  const { form, dirty, saving, saved, errorMessage, discard } =
    useUserTagsForm(config)
  const status = useTagStatus()
  const { actions, anyRunning, run, runRemove } = useTagActions(config)
  const guard = useLeaveGuard(dirty)
  const [remove, setRemove] = useState({
    open: false,
    deleteDefinitions: false,
  })
  const removedTagMode = useStore(
    form.store,
    (state) => state.values.removedTagMode,
  )

  const taggingOn = config.tagUsersInSonarr || config.tagUsersInRadarr
  const statusDetail = status.loaded
    ? `${formatCount(status.tagTotal, 'tag')} on ${formatCount(status.instanceCount, 'instance')}, ${formatCount(status.taggedItemTotal, 'tagged item')}`
    : undefined
  const actionsBlocked = dirty || anyRunning
  const formatLock = status.lockReason
    ? {
        reason: status.lockReason,
        action: status.tagsExist && (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={
              actionsBlocked || actions.remove.unavailableReason !== null
            }
            onClick={() => setRemove({ open: true, deleteDefinitions: true })}
          >
            Delete tags
          </Button>
        ),
      }
    : undefined
  const removedTagLock =
    status.lockReason && removedTagMode === 'special-tag'
      ? { reason: status.lockReason }
      : undefined

  return (
    <Page>
      <PageHeader
        section={SECTION}
        title={TITLE}
        description={DESCRIPTION}
        action={<EnabledPill on={taggingOn} detail={statusDetail} />}
      />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <ActionsSection
            dirty={dirty}
            actions={syncActionSpecs(ACTION_ROWS, actions, run, () =>
              setRemove({ open: true, deleteDefinitions: false }),
            )}
          />
          <SettingsSection title="Where to tag">
            <form.AppField name="tagUsersInSonarr">
              {(field) => (
                <field.SwitchField
                  label="Tag shows in Sonarr"
                  description="Adds a tag for each user who has the show on their watchlist."
                />
              )}
            </form.AppField>
            <form.AppField name="tagUsersInRadarr">
              {(field) => (
                <field.SwitchField
                  label="Tag movies in Radarr"
                  description="Adds a tag for each user who has the movie on their watchlist."
                />
              )}
            </form.AppField>
          </SettingsSection>
          <NamingFormatSection
            form={form}
            fields={NAMING_FIELDS}
            title="Tag format"
            noun="Tags"
            separator="-"
            placeholder={TAG_PREFIX_DEFAULTS.tagPrefix}
            disabled={status.locked}
            lock={formatLock}
          />
          <SettingsSection
            title="When something leaves a watchlist"
            lock={removedTagLock}
          >
            <form.AppField name="removedTagMode">
              {(field) => (
                <field.RadioField
                  label="Tag behavior"
                  options={REMOVED_TAG_OPTIONS}
                />
              )}
            </form.AppField>
            <form.AppField name="removedTagPrefix">
              {(field) => (
                <field.TextField
                  label="Removed tag"
                  type="text"
                  placeholder={TAG_PREFIX_DEFAULTS.removedTagPrefix}
                  disabled={status.locked || removedTagMode !== 'special-tag'}
                />
              )}
            </form.AppField>
            <form.AppField name="cleanupOrphanedTags">
              {(field) => (
                <field.SwitchField
                  label="Clean up orphaned tags on sync"
                  description="Removes tags for users who were deleted or renamed in Plex."
                />
              )}
            </form.AppField>
          </SettingsSection>
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
          />
        </form.Form>
      </form.AppForm>
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
      <RemoveTagsDialog
        key={String(remove.deleteDefinitions)}
        open={remove.open}
        defaultDeleteDefinitions={remove.deleteDefinitions}
        onOpenChange={(open) => setRemove((prev) => ({ ...prev, open }))}
        onConfirm={runRemove}
      />
    </Page>
  )
}

export default function UserTagsPage() {
  const { config, error, initialize } = useConfig()
  const showLoading = useShowLoading(!config)

  if (error && !config) {
    return (
      <Page>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <RetryAlert message={error} onRetry={() => initialize(true)} />
      </Page>
    )
  }
  if (showLoading) return <SettingsPageSkeleton {...USER_TAGS_SKELETON} />
  if (!config) return null
  return <UserTagsSettings config={config} />
}
