import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { ErrorAlert } from '@/components/error-alert'
import { InlineCode } from '@/components/inline-code'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { ActionsSection } from '@/components/settings/actions-section'
import { SaveBar } from '@/components/settings/save-bar'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { AliasReadinessCredenza } from '@/features/users/components/alias-readiness-credenza'
import { RemoveTagsDialog } from '@/features/users/components/user-tags/remove-tags-dialog'
import {
  type TagActionId,
  useTagActions,
} from '@/features/users/hooks/user-tags/useTagActions'
import { useTagStatus } from '@/features/users/hooks/user-tags/useTagStatus'
import { useUserTagsForm } from '@/features/users/hooks/user-tags/useUserTagsForm'
import { useConfig } from '@/hooks/useConfig'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useShowLoading } from '@/hooks/useMinLoading'
import { formatCount } from '@/lib/format'
import {
  SAMPLE_USER_NAMES,
  USER_NAMING_SOURCE_OPTIONS,
} from '@/lib/user-naming'
import type { components } from '@/types/api.js'

const TITLE = 'User tags'
const DESCRIPTION = 'Tag content in Sonarr and Radarr by who requested it.'

const ACTION_ROWS: Array<{
  id: TagActionId
  title: string
  description: string
  buttonLabel: string
  busyLabel: string
}> = [
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
  const [aliasOpen, setAliasOpen] = useState(false)
  const namingSource = useStore(
    form.store,
    (state) => state.values.tagNamingSource,
  )
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
        title={TITLE}
        description={DESCRIPTION}
        action={
          <StatusPill
            tone={taggingOn ? 'on' : 'off'}
            label={taggingOn ? 'Enabled' : 'Disabled'}
            detail={statusDetail}
          />
        }
      />
      <form.AppForm>
        <form.Form className="flex flex-col gap-5">
          <ActionsSection
            dirty={dirty}
            actions={ACTION_ROWS.map(({ id, ...row }) => ({
              ...row,
              id,
              destructive: id === 'remove',
              state: actions[id],
              onRun:
                id === 'remove'
                  ? () => setRemove({ open: true, deleteDefinitions: false })
                  : () => run(id),
            }))}
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
          <SettingsSection title="Tag format" lock={formatLock}>
            <form.AppField name="tagPrefix">
              {(field) => (
                <field.TextField
                  label="Prefix"
                  type="text"
                  placeholder="pulsarr-user"
                  disabled={status.locked}
                  preview={(prefix) => (
                    <>
                      Tags look like{' '}
                      <InlineCode>
                        {`${prefix || 'pulsarr-user'}-${SAMPLE_USER_NAMES[namingSource]}`}
                      </InlineCode>
                    </>
                  )}
                />
              )}
            </form.AppField>
            <form.AppField name="tagNamingSource">
              {(field) => (
                <field.SegmentedField
                  label="Name from"
                  description="Users without an alias fall back to their Plex username."
                  options={USER_NAMING_SOURCE_OPTIONS}
                  disabled={status.locked}
                  onBeforeChange={(next) => {
                    if (next !== 'alias') return true
                    setAliasOpen(true)
                    return false
                  }}
                />
              )}
            </form.AppField>
          </SettingsSection>
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
                  placeholder="pulsarr-removed"
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
      <AliasReadinessCredenza
        open={aliasOpen}
        onOpenChange={setAliasOpen}
        onConfirm={() => {
          form.setFieldValue('tagNamingSource', 'alias')
          setAliasOpen(false)
        }}
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
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ErrorAlert message={error} />
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={() => initialize(true)}
        >
          Retry
        </Button>
      </Page>
    )
  }
  if (showLoading) return <SettingsPageSkeleton sections={4} />
  if (!config) return null
  return <UserTagsSettings config={config} />
}
