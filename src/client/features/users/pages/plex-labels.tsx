import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { ErrorAlert } from '@/components/error-alert'
import { InlineCode } from '@/components/inline-code'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { ActionsSection } from '@/components/settings/actions-section'
import { SaveBar } from '@/components/settings/save-bar'
import { ScheduledJobPanel } from '@/components/settings/scheduled-job-panel'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { AliasReadinessCredenza } from '@/features/users/components/alias-readiness-credenza'
import {
  type LabelActionId,
  useLabelActions,
} from '@/features/users/hooks/plex-labels/useLabelActions'
import { usePlexLabelsForm } from '@/features/users/hooks/plex-labels/usePlexLabelsForm'
import { PLEX_LABELS_SKELETON } from '@/features/users/lib/plex-labels-skeleton'
import { useConfig } from '@/hooks/useConfig'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import { useShowLoading } from '@/hooks/useMinLoading'
import { type ScheduleStatus, useSchedule } from '@/hooks/useSchedule'
import { NAV_PAGES } from '@/lib/navigation'
import {
  SAMPLE_USER_NAMES,
  USER_NAMING_SOURCE_OPTIONS,
} from '@/lib/user-naming'
import type { components } from '@/types/api.js'

const SECTION = 'Users'
const TITLE = NAV_PAGES.plexLabels.label
const DESCRIPTION =
  'Label movies and shows in Plex by who has them on their watchlist.'
const SCHEDULE_NAME = 'plex-label-full-sync'
const PREFIX_PLACEHOLDER = 'pulsarr'
const REMOVED_PLACEHOLDER = 'pulsarr:removed'

const ACTION_ROWS: Array<{
  id: LabelActionId
  title: string
  description: string
  buttonLabel: string
  busyLabel: string
}> = [
  {
    id: 'cleanup',
    title: 'Clean up orphaned labels',
    description:
      'Deletes labels from removed or renamed users, and queued ones that never reached Plex.',
    buttonLabel: 'Clean up',
    busyLabel: 'Cleaning...',
  },
  {
    id: 'remove',
    title: 'Remove all Pulsarr labels',
    description: 'Undo labeling everywhere.',
    buttonLabel: 'Remove',
    busyLabel: 'Removing...',
  },
]

const REMOVED_LABEL_OPTIONS = [
  { value: 'remove', label: 'Remove the label' },
  {
    value: 'keep',
    label: 'Keep the label',
    description: 'The label stays as a record of who asked.',
  },
  {
    value: 'special-label',
    label: 'Swap for a removed label',
    description:
      'Once nobody wants it, the user labels come off and a marker label goes on, so you can find leftovers.',
  },
] as const satisfies Array<{
  value: components['schemas']['RemovedLabelMode']
  label: string
  description?: string
}>

function PlexLabelsSettings({
  config,
  schedule,
  run,
}: {
  config: components['schemas']['Config']
  schedule: ScheduleStatus
  run: ReturnType<typeof useSchedule>['run']
}) {
  const {
    configForm,
    scheduleForm,
    dirty,
    saving,
    saved,
    errorMessage,
    discard,
    submit,
  } = usePlexLabelsForm(config, schedule)
  const labels = useLabelActions(config.plexLabelSync)
  const guard = useLeaveGuard(dirty)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [aliasOpen, setAliasOpen] = useState(false)
  const scheduleOn = useStore(
    scheduleForm.store,
    (state) => state.values.enabled,
  )
  const namingSource = useStore(
    configForm.store,
    (state) => state.values.plexLabelSync.labelNamingSource,
  )
  const removedLabelMode = useStore(
    configForm.store,
    (state) => state.values.plexLabelSync.removedLabelMode,
  )
  const tagSyncOn = useStore(
    configForm.store,
    (state) => state.values.plexLabelSync.tagSync.enabled,
  )

  const labelingOn = config.plexLabelSync.enabled
  const actionsBlocked = dirty || labels.anyRunning
  const lockReason =
    labelingOn && !labels.removedSinceSync
      ? 'Remove all Pulsarr labels to change the format.'
      : null
  const formatLock = lockReason
    ? {
        reason: lockReason,
        action: (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={actionsBlocked}
            onClick={() => setRemoveOpen(true)}
          >
            Remove labels
          </Button>
        ),
      }
    : undefined
  const removedLabelLock =
    lockReason && removedLabelMode === 'special-label'
      ? { reason: lockReason }
      : undefined

  return (
    <Page>
      <PageHeader
        section={SECTION}
        title={TITLE}
        description={DESCRIPTION}
        action={
          <StatusPill
            tone={labelingOn ? 'on' : 'off'}
            label={labelingOn ? 'Enabled' : 'Disabled'}
          />
        }
      />
      <configForm.AppForm>
        <configForm.Form className="flex flex-col gap-5" submit={submit}>
          <ActionsSection
            dirty={dirty}
            actions={ACTION_ROWS.map(({ id, ...row }) => ({
              ...row,
              id,
              destructive: id === 'remove',
              state: labels.actions[id],
              onRun:
                id === 'remove'
                  ? () => setRemoveOpen(true)
                  : () => labels.run(id),
            }))}
          />
          <ScheduledJobPanel
            title="Full sync"
            description="Rechecks every watchlisted item and fixes its labels. Skipped while labeling is off."
            schedule={schedule}
            dirty={dirty}
            run={run}
          >
            <scheduleForm.AppField name="enabled">
              {(field) => (
                <field.SwitchField
                  label="Run on a schedule"
                  description="Turn off to pause automatic runs."
                />
              )}
            </scheduleForm.AppField>
            <scheduleForm.AppField name="expression">
              {(field) => (
                <field.ScheduleField
                  label="Run at"
                  description="In the server's time zone."
                  disabled={!scheduleOn}
                />
              )}
            </scheduleForm.AppField>
          </ScheduledJobPanel>
          <SettingsSection title="Labeling">
            <configForm.AppField name="plexLabelSync.enabled">
              {(field) => (
                <field.SwitchField
                  label="Label content in Plex"
                  description="Labels each item with the users who watchlist it, once it's in Plex."
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection title="Label format" lock={formatLock}>
            <configForm.AppField name="plexLabelSync.labelPrefix">
              {(field) => (
                <field.TextField
                  label="Prefix"
                  type="text"
                  placeholder={PREFIX_PLACEHOLDER}
                  disabled={lockReason !== null}
                  preview={(prefix) => (
                    <>
                      Labels look like{' '}
                      <InlineCode>
                        {`${prefix || PREFIX_PLACEHOLDER}:${SAMPLE_USER_NAMES[namingSource]}`}
                      </InlineCode>
                    </>
                  )}
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="plexLabelSync.labelNamingSource">
              {(field) => (
                <field.SegmentedField
                  label="Name from"
                  description="Users without an alias fall back to their Plex username."
                  options={USER_NAMING_SOURCE_OPTIONS}
                  disabled={lockReason !== null}
                  onBeforeChange={(next) => {
                    if (next !== 'alias') return true
                    setAliasOpen(true)
                    return false
                  }}
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="When something leaves a watchlist"
            lock={removedLabelLock}
          >
            <configForm.AppField name="plexLabelSync.removedLabelMode">
              {(field) => (
                <field.RadioField
                  label="Label behavior"
                  options={REMOVED_LABEL_OPTIONS}
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="plexLabelSync.removedLabelPrefix">
              {(field) => (
                <field.TextField
                  label="Removed label"
                  type="text"
                  placeholder={REMOVED_PLACEHOLDER}
                  disabled={
                    lockReason !== null || removedLabelMode !== 'special-label'
                  }
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="plexLabelSync.cleanupOrphanedLabels">
              {(field) => (
                <field.SwitchField
                  label="Clean up orphaned labels on sync"
                  description="Removes labels for users who were deleted, renamed or stopped syncing."
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="plexLabelSync.autoResetOnScheduledSync">
              {(field) => (
                <field.SwitchField
                  label="Reset labels before each sync"
                  description="Applies the rule above to leftover labels before each sync. Turn on after leaving Keep."
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="Tag sync"
            description="Copies Radarr and Sonarr tags to Plex as labels, except user tags."
          >
            <configForm.AppField name="plexLabelSync.tagSync.enabled">
              {(field) => (
                <field.SwitchField
                  label="Sync tags as labels"
                  description="Each tag on an item becomes a label on it in Plex."
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="plexLabelSync.tagSync.syncRadarrTags">
              {(field) => (
                <field.SwitchField
                  label="Radarr tags on movies"
                  disabled={!tagSyncOn}
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="plexLabelSync.tagSync.syncSonarrTags">
              {(field) => (
                <field.SwitchField
                  label="Sonarr tags on shows"
                  disabled={!tagSyncOn}
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
          />
        </configForm.Form>
      </configForm.AppForm>
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
      <ConfirmCredenza
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove all Pulsarr labels?"
        description="Strips every label Pulsarr added from movies and shows in Plex, user and tag labels alike. Other labels and your content aren't touched."
        confirmLabel="Remove labels"
        confirmVariant="destructive"
        onConfirm={() => {
          labels.runRemove()
          setRemoveOpen(false)
        }}
      />
      <AliasReadinessCredenza
        open={aliasOpen}
        onOpenChange={setAliasOpen}
        onConfirm={() => {
          configForm.setFieldValue('plexLabelSync.labelNamingSource', 'alias')
          setAliasOpen(false)
        }}
      />
    </Page>
  )
}

export default function PlexLabelsPage() {
  const { config, error, initialize } = useConfig()
  const job = useSchedule(SCHEDULE_NAME, {
    label: 'Full label sync',
    page: NAV_PAGES.plexLabels,
  })
  const loaded = config !== null && job.schedule !== null
  const showLoading = useShowLoading(!loaded)
  const loadError =
    (!config && error) || (!job.schedule && job.errorMessage) || null

  if (loadError) {
    return (
      <Page>
        <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
        <ErrorAlert message={loadError} />
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={() => {
            if (!config) initialize(true)
            if (!job.schedule) job.retry()
          }}
        >
          Retry
        </Button>
      </Page>
    )
  }
  if (showLoading) return <SettingsPageSkeleton {...PLEX_LABELS_SKELETON} />
  if (!config || !job.schedule) return null
  return (
    <PlexLabelsSettings config={config} schedule={job.schedule} run={job.run} />
  )
}
