import { PLEX_LABEL_SYNC_DEFAULTS } from '@root/schemas/plex/label-sync-config.schema'
import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { ConfigPageGate } from '@/components/config-page-gate'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { LeaveDialog } from '@/components/leave-dialog'
import { Page, PageHeader } from '@/components/page-header'
import { ActionsSection } from '@/components/settings/actions-section'
import { SaveBar } from '@/components/settings/save-bar'
import { ScheduledJobPanel } from '@/components/settings/scheduled-job-panel'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { Button } from '@/components/ui/button'
import { EnabledPill } from '@/features/users/components/enabled-pill'
import { NamingFormatSection } from '@/features/users/components/naming-format-section'
import {
  type LabelActionId,
  useLabelActions,
} from '@/features/users/hooks/plex-labels/useLabelActions'
import { usePlexLabelsForm } from '@/features/users/hooks/plex-labels/usePlexLabelsForm'
import { PLEX_LABELS_SKELETON } from '@/features/users/lib/plex-labels-skeleton'
import {
  type SyncActionCopy,
  syncActionSpecs,
} from '@/features/users/lib/sync-actions'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import { NAV_PAGES } from '@/lib/navigation'
import type { components } from '@/types/api.js'

const SECTION = 'Users'
const TITLE = NAV_PAGES.plexLabels.label
const DESCRIPTION =
  'Label movies and shows in Plex by who has them on their watchlist.'
const SCHEDULE_NAME = 'plex-label-full-sync'

const NAMING_FIELDS = {
  prefix: 'plexLabelSync.labelPrefix',
  namingSource: 'plexLabelSync.labelNamingSource',
} as const

const ACTION_ROWS: SyncActionCopy<LabelActionId>[] = [
  {
    id: 'cleanup',
    title: 'Clean up orphaned labels',
    description:
      'Deletes labels of removed, renamed or non-syncing users, and stuck ones.',
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
      'Once nobody wants it, its labels swap for one marker you can find.',
  },
] as const satisfies Array<{
  value: components['schemas']['RemovedLabelMode']
  label: string
  description?: string
}>

function PlexLabelsSettings({
  config,
  schedule,
}: {
  config: components['schemas']['Config']
  schedule: ScheduleStatus
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
  const scheduleOn = useStore(
    scheduleForm.store,
    (state) => state.values.enabled,
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
        action={<EnabledPill on={labelingOn} />}
      />
      <configForm.AppForm>
        <configForm.Form className="flex flex-col gap-5" submit={submit}>
          <ActionsSection
            dirty={dirty}
            actions={syncActionSpecs(
              ACTION_ROWS,
              labels.actions,
              labels.run,
              () => setRemoveOpen(true),
            )}
          />
          <SettingsSection title="Labeling">
            <configForm.AppField name="plexLabelSync.enabled">
              {(field) => (
                <field.SwitchField
                  label="Label content in Plex"
                  description="Labels each item with who watchlists it, once it's in Plex."
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <ScheduledJobPanel
            title="Full sync"
            description="Rechecks every watchlisted item and fixes its labels. Needs labeling on."
            schedule={schedule}
            dirty={dirty}
            run={labels.syncRun}
            requiresSchedule={false}
            result={labels.syncRun.result}
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
          <NamingFormatSection
            form={configForm}
            fields={NAMING_FIELDS}
            title="Label format"
            noun="Labels"
            separator=":"
            placeholder={PLEX_LABEL_SYNC_DEFAULTS.labelPrefix}
            disabled={lockReason !== null}
            lock={formatLock}
          />
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
                  placeholder={PLEX_LABEL_SYNC_DEFAULTS.removedLabelPrefix}
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
    </Page>
  )
}

export default function PlexLabelsPage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<SettingsPageSkeleton {...PLEX_LABELS_SKELETON} />}
      schedule={{
        name: SCHEDULE_NAME,
        meta: { label: 'Full label sync', page: NAV_PAGES.plexLabels },
      }}
    >
      {(config, job) => (
        <PlexLabelsSettings config={config} schedule={job.schedule} />
      )}
    </ConfigPageGate>
  )
}
