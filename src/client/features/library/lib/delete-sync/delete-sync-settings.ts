import { MAX_DELETION_PREVENTION } from '@root/schemas/shared/delete-sync-limits'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

type SavedSettings = Pick<
  Config,
  | 'deletionMode'
  | 'deleteSyncRequiredTagRegex'
  | 'deleteMovie'
  | 'deleteEndedShow'
  | 'deleteContinuingShow'
  | 'deleteFiles'
  | 'deleteSyncCleanupApprovals'
  | 'respectUserSyncSetting'
  | 'deleteSyncTrackedOnly'
  | 'maxDeletionPrevention'
  | 'enablePlexPlaylistProtection'
  | 'plexProtectionPlaylistName'
  | 'deleteSyncNotify'
  | 'deleteSyncNotifyOnlyOnDeletion'
>

/** The form slice this page owns. User tags owns the removal tag mode and prefix. */
export function deleteSyncValues(config: SavedSettings) {
  return {
    deletionMode: config.deletionMode,
    deleteSyncRequiredTagRegex: config.deleteSyncRequiredTagRegex,
    deleteMovie: config.deleteMovie,
    deleteEndedShow: config.deleteEndedShow,
    deleteContinuingShow: config.deleteContinuingShow,
    deleteFiles: config.deleteFiles,
    deleteSyncCleanupApprovals: config.deleteSyncCleanupApprovals,
    respectUserSyncSetting: config.respectUserSyncSetting,
    deleteSyncTrackedOnly: config.deleteSyncTrackedOnly,
    maxDeletionPrevention:
      config.maxDeletionPrevention ?? MAX_DELETION_PREVENTION.default,
    enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
    plexProtectionPlaylistName: config.plexProtectionPlaylistName,
    deleteSyncNotify: config.deleteSyncNotify,
    deleteSyncNotifyOnlyOnDeletion: config.deleteSyncNotifyOnlyOnDeletion,
  }
}

export type DeleteSyncValues = ReturnType<typeof deleteSyncValues>

export function anyTypeSelected(
  values: Pick<
    DeleteSyncValues,
    'deleteMovie' | 'deleteEndedShow' | 'deleteContinuingShow'
  >,
): boolean {
  return (
    values.deleteMovie || values.deleteEndedShow || values.deleteContinuingShow
  )
}

/** Equal keys mean a dry run reports for these settings. Schedule, notify and approval cleanup fields are left out. */
export function dryRunKey(
  config: SavedSettings & Pick<Config, 'removedTagPrefix'>,
): string {
  const {
    deleteSyncNotify,
    deleteSyncNotifyOnlyOnDeletion,
    deleteSyncCleanupApprovals,
    ...reported
  } = deleteSyncValues(config)
  return JSON.stringify({
    ...reported,
    removedTagPrefix: config.removedTagPrefix,
  })
}
