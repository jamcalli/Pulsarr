import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'
import { MAX_DELETION_PREVENTION } from '@root/schemas/shared/delete-sync-limits'
import { z } from 'zod'

const MAX_DELETION_ERROR = `Enter a whole number from ${MAX_DELETION_PREVENTION.min} to ${MAX_DELETION_PREVENTION.max}.`

const MaxDeletionSchema = z
  .number({ error: MAX_DELETION_ERROR })
  .int({ error: MAX_DELETION_ERROR })
  .min(MAX_DELETION_PREVENTION.min, { error: MAX_DELETION_ERROR })
  .max(MAX_DELETION_PREVENTION.max, { error: MAX_DELETION_ERROR })

export const DeleteSyncFormSchema = ConfigUpdateSchema.pick({
  deletionMode: true,
  deleteSyncRequiredTagRegex: true,
  deleteMovie: true,
  deleteEndedShow: true,
  deleteContinuingShow: true,
  deleteFiles: true,
  deleteSyncCleanupApprovals: true,
  respectUserSyncSetting: true,
  deleteSyncTrackedOnly: true,
  enablePlexPlaylistProtection: true,
  plexProtectionPlaylistName: true,
  deleteSyncNotify: true,
  deleteSyncNotifyOnlyOnDeletion: true,
})
  .required()
  .extend({ maxDeletionPrevention: MaxDeletionSchema })

export function isValidMaxDeletion(value: number | undefined): boolean {
  return MaxDeletionSchema.safeParse(value).success
}
