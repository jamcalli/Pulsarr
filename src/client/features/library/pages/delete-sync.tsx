import {
  MAX_DELETION_PREVENTION,
  PLEX_PROTECTION_PLAYLIST_DEFAULT,
} from '@root/schemas/shared/delete-sync-limits'
import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { ConfigPageGate } from '@/components/config-page-gate'
import { FieldRow } from '@/components/form/field-row'
import { InlineCode } from '@/components/inline-code'
import { LeaveDialog } from '@/components/leave-dialog'
import { NavPageButton } from '@/components/nav-page-button'
import { Page, PageHeader } from '@/components/page-header'
import { ActionRow } from '@/components/settings/action-row'
import { InfoLine } from '@/components/settings/info-line'
import { LockLine } from '@/components/settings/lock-line'
import { SaveBar } from '@/components/settings/save-bar'
import { ScheduledJobPanel } from '@/components/settings/scheduled-job-panel'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { WatchlistSyncSteps } from '@/components/watchlist-sync-steps'
import { DryRunItemsCredenza } from '@/features/library/components/delete-sync/dry-run-items-credenza'
import { DryRunResult } from '@/features/library/components/delete-sync/dry-run-result'
import {
  RunNowConfirm,
  ScheduleOnConfirm,
} from '@/features/library/components/delete-sync/run-confirms'
import { useDeleteSyncForm } from '@/features/library/hooks/delete-sync/useDeleteSyncForm'
import { useDryRun } from '@/features/library/hooks/delete-sync/useDryRun'
import {
  latestDryRunLine,
  maxDeletionHelp,
  playlistHelp,
  removalTagWarning,
  scheduleHelp,
} from '@/features/library/lib/delete-sync/delete-sync-copy'
import { isValidMaxDeletion } from '@/features/library/lib/delete-sync/delete-sync-form.schema'
import {
  anyTypeSelected,
  dryRunKey,
} from '@/features/library/lib/delete-sync/delete-sync-settings'
import { DELETE_SYNC_SKELETON } from '@/features/library/lib/delete-sync/delete-sync-skeleton'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import type { ScheduleStatus, useSchedule } from '@/hooks/useSchedule'
import { NAV_PAGES } from '@/lib/navigation'
import { notifyOptions } from '@/lib/notify-labels'
import type { components } from '@/types/api.js'

const SECTION = 'Library'
const TITLE = NAV_PAGES.deleteSync.label
const DESCRIPTION =
  'Remove movies and shows from Radarr and Sonarr once nobody wants them.'
const SCHEDULE_NAME = 'delete-sync'

const MODE_OPTIONS = [
  {
    value: 'watchlist',
    label: 'Watchlist based',
    description: "Deletes anything not on a counted user's watchlist.",
  },
  {
    value: 'tag-based',
    label: 'Tag based',
    description: 'Deletes anything carrying the removal tag.',
  },
] as const satisfies Array<{
  value: components['schemas']['DeletionMode']
  label: string
  description: string
}>

const PICK_TYPES_REASON = 'Pick movies or shows first.'
const NOTHING_SELECTED_RUN_REASON =
  'Nothing is selected, so a run would do nothing.'

type Confirm = 'run' | 'schedule' | null

function DeleteSyncSettings({
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
  } = useDeleteSyncForm(config, schedule)
  const guard = useLeaveGuard(dirty)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [itemsOpen, setItemsOpen] = useState(false)
  const values = useStore(configForm.store, (state) => state.values)
  const invalid = useStore(configForm.store, (state) => !state.isValid)
  const scheduleValues = useStore(scheduleForm.store, (state) => state.values)

  const savedAnyType = anyTypeSelected(config)
  const savedKey = dryRunKey(config)
  const dryRun = useDryRun({
    key: savedKey,
    nothingSelected: !savedAnyType,
    deleteFiles: config.deleteFiles,
  })
  const draftKey = dryRunKey({ ...config, ...values })
  const tagMode = values.deletionMode === 'tag-based'
  const swapsTag = config.removedTagMode === 'special-tag'
  const nothingSelected = !anyTypeSelected(values)
  const latest = dryRun.result
  const latestLine = (key: string) =>
    latest && latest.data.key === key
      ? latestDryRunLine(
          latest.data.results,
          latest.data.nothingSelected,
          latest.ranAt,
        )
      : null

  const save = () => {
    if (invalid) return
    if (!schedule.enabled && scheduleValues.enabled) setConfirm('schedule')
    else submit()
  }

  const removalTagButton = <NavPageButton page={NAV_PAGES.userTags} />
  const exclusionsLine = tagMode
    ? 'Excluded titles are candidates even without the tag.'
    : 'Excluded titles count as not on any watchlist.'

  return (
    <Page>
      <PageHeader section={SECTION} title={TITLE} description={DESCRIPTION} />
      <configForm.AppForm>
        <configForm.Form className="flex flex-col gap-5" submit={save}>
          <ScheduledJobPanel
            title="Runs and schedule"
            description="Preview with a dry run, then run once or on a schedule."
            schedule={schedule}
            dirty={dirty}
            run={{
              run: () => setConfirm('run'),
              running: run.running,
              errorMessage: run.errorMessage,
              unavailableReason: savedAnyType
                ? null
                : NOTHING_SELECTED_RUN_REASON,
              blocked: dryRun.running,
            }}
            before={
              <ActionRow
                title="Dry run"
                description="Previews a run without deleting. Still refreshes watchlists and notifies."
                buttonLabel="Dry run"
                busyLabel="Running..."
                disabled={dirty || run.running}
                running={dryRun.running}
                onRun={dryRun.run}
                live={dryRun.running ? <WatchlistSyncSteps /> : undefined}
                result={
                  latest && (
                    <DryRunResult
                      ranAt={latest.ranAt}
                      result={latest.data.results}
                      nothingSelected={latest.data.nothingSelected}
                      stale={latest.data.key !== savedKey}
                      onView={() => setItemsOpen(true)}
                    />
                  )
                }
                errorMessage={dryRun.errorMessage}
              />
            }
          >
            <scheduleForm.AppField name="enabled">
              {(field) => (
                <field.SwitchField
                  label="Run on a schedule"
                  description={scheduleHelp(scheduleValues.expression)}
                />
              )}
            </scheduleForm.AppField>
            <scheduleForm.AppField name="expression">
              {(field) => <field.ScheduleField label="Day and time" />}
            </scheduleForm.AppField>
          </ScheduledJobPanel>
          <SettingsSection
            title="Mode"
            description="What counts as no longer wanted."
          >
            <configForm.AppField name="deletionMode">
              {(field) => (
                <field.RadioField label="Decide by" options={MODE_OPTIONS} />
              )}
            </configForm.AppField>
            {tagMode && (
              <FieldRow
                label="Removal tag"
                description="Set on User tags. Matching ignores case."
              >
                <div className="flex items-center gap-3">
                  <InlineCode>{config.removedTagPrefix}</InlineCode>
                  {swapsTag && removalTagButton}
                </div>
              </FieldRow>
            )}
            {tagMode && !swapsTag && (
              <InfoLine tone="warn" action={removalTagButton}>
                {removalTagWarning(config.removedTagMode)}
              </InfoLine>
            )}
            {tagMode && (
              <configForm.AppField name="deleteSyncRequiredTagRegex">
                {(field) => (
                  <field.TextField
                    label="Required tag pattern"
                    description="Items also need a tag matching this regex. Leave empty to skip."
                    type="text"
                    placeholder="pulsarr2-removed"
                    mono
                  />
                )}
              </configForm.AppField>
            )}
            <InfoLine action={<NavPageButton page={NAV_PAGES.exclusions} />}>
              {exclusionsLine}
            </InfoLine>
          </SettingsSection>
          <SettingsSection
            title="What may be deleted"
            description="Nothing outside these choices is deleted."
          >
            {nothingSelected && (
              <InfoLine tone="warn">
                Nothing is selected, so runs delete nothing.
              </InfoLine>
            )}
            <configForm.AppField name="deleteMovie">
              {(field) => (
                <field.SwitchField
                  label="Delete movies"
                  description="Removes movies from Radarr."
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="deleteEndedShow">
              {(field) => (
                <field.SwitchField
                  label="Delete ended shows"
                  description="Removes shows Sonarr marks as ended."
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="deleteContinuingShow">
              {(field) => (
                <field.SwitchField
                  label="Delete continuing shows"
                  description="Removes every show Sonarr does not mark as ended."
                />
              )}
            </configForm.AppField>
            {nothingSelected && <LockLine reason={PICK_TYPES_REASON} />}
            <configForm.AppField name="deleteFiles">
              {(field) => (
                <field.SwitchField
                  label="Delete files"
                  description="Also deletes the media files on disk."
                  disabled={nothingSelected}
                />
              )}
            </configForm.AppField>
            {values.deleteFiles && !nothingSelected && (
              <InfoLine tone="danger">This can't be undone.</InfoLine>
            )}
            <configForm.AppField name="deleteSyncCleanupApprovals">
              {(field) => (
                <field.SwitchField
                  label="Clean up approval records"
                  description="Removes approval records for deleted content and content already gone."
                  disabled={nothingSelected}
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="What protects content"
            description="Anything a guard covers is skipped."
          >
            {tagMode && <LockLine reason="Only used in watchlist mode." />}
            <configForm.AppField name="respectUserSyncSetting">
              {(field) => (
                <field.SwitchField
                  label="Respect user sync settings"
                  description="Only watchlists of users with sync on protect content."
                  disabled={tagMode}
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="deleteSyncTrackedOnly">
              {(field) => (
                <field.SwitchField
                  label="Tracked content only"
                  description="Only content requested through Pulsarr can be deleted."
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="maxDeletionPrevention">
              {(field) => (
                <field.NumberField
                  label="Max deletion"
                  description={maxDeletionHelp(
                    isValidMaxDeletion(values.maxDeletionPrevention)
                      ? values.maxDeletionPrevention
                      : undefined,
                  )}
                  unitSymbol="%"
                  min={MAX_DELETION_PREVENTION.min}
                  max={MAX_DELETION_PREVENTION.max}
                  allowOutOfRange
                />
              )}
            </configForm.AppField>
            <configForm.AppField name="enablePlexPlaylistProtection">
              {(field) => (
                <field.SwitchField
                  label="Playlist protection"
                  description="Skips anything in any user's Plex playlist of this name."
                />
              )}
            </configForm.AppField>
            {!values.enablePlexPlaylistProtection && (
              <LockLine reason="Turn on playlist protection first." />
            )}
            <configForm.AppField name="plexProtectionPlaylistName">
              {(field) => (
                <field.TextField
                  label="Playlist name"
                  description={playlistHelp(values.plexProtectionPlaylistName)}
                  type="text"
                  placeholder={PLEX_PROTECTION_PLAYLIST_DEFAULT}
                  disabled={!values.enablePlexPlaylistProtection}
                />
              )}
            </configForm.AppField>
          </SettingsSection>
          <SettingsSection
            title="Notifications"
            description="Where each run's summary goes, dry runs included."
          >
            <configForm.AppField name="deleteSyncNotify">
              {(field) => (
                <field.SelectField
                  label="Send the run summary to"
                  options={notifyOptions(config.deleteSyncNotify)}
                />
              )}
            </configForm.AppField>
            {values.deleteSyncNotify === 'none' && (
              <LockLine reason="Pick where the summary goes first." />
            )}
            <configForm.AppField name="deleteSyncNotifyOnlyOnDeletion">
              {(field) => (
                <field.SwitchField
                  label="Only when something was deleted"
                  description="Skips the summary when a run deletes nothing."
                  disabled={values.deleteSyncNotify === 'none'}
                />
              )}
            </configForm.AppField>
            <InfoLine action={<NavPageButton page={NAV_PAGES.webhooks} />}>
              Webhooks always get the delete_sync.completed event.
            </InfoLine>
          </SettingsSection>
          <SaveBar
            dirty={dirty}
            isSubmitting={saving}
            saved={saved}
            errorMessage={errorMessage}
            onDiscard={discard}
            saveDisabled={invalid}
          />
        </configForm.Form>
      </configForm.AppForm>
      <LeaveDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
      {latest && (
        <DryRunItemsCredenza
          key={latest.ranAt}
          open={itemsOpen}
          onOpenChange={setItemsOpen}
          result={latest.data.results}
          deleteFiles={latest.data.deleteFiles}
        />
      )}
      <RunNowConfirm
        open={confirm === 'run'}
        onOpenChange={(open) => setConfirm(open ? 'run' : null)}
        deleteFiles={config.deleteFiles}
        dryRunLine={latestLine(savedKey)}
        onDryRunFirst={() => {
          setConfirm(null)
          dryRun.run()
        }}
        onConfirm={() => {
          setConfirm(null)
          run.run()
        }}
      />
      <ScheduleOnConfirm
        open={confirm === 'schedule'}
        onOpenChange={(open) => setConfirm(open ? 'schedule' : null)}
        expression={scheduleValues.expression}
        deleteFiles={values.deleteFiles}
        dryRunLine={latestLine(draftKey)}
        onConfirm={() => {
          setConfirm(null)
          submit()
        }}
      />
    </Page>
  )
}

export default function DeleteSyncPage() {
  return (
    <ConfigPageGate
      section={SECTION}
      title={TITLE}
      description={DESCRIPTION}
      skeleton={<SettingsPageSkeleton {...DELETE_SYNC_SKELETON} />}
      schedule={{
        name: SCHEDULE_NAME,
        meta: { label: 'Delete sync', page: NAV_PAGES.deleteSync },
      }}
    >
      {(config, job) => (
        <DeleteSyncSettings
          config={config}
          schedule={job.schedule}
          run={job.run}
        />
      )}
    </ConfigPageGate>
  )
}
