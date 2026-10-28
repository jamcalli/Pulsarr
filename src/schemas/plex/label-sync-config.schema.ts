import { UserNamingSourceSchema } from '@root/schemas/common/user-naming-source.schema.js'
import { z } from 'zod'

const LabelPrefixSchema = z
  .string()
  .trim()
  .min(1, { error: 'Enter a prefix.' })
  .regex(/^[a-zA-Z0-9_\-:.]+$/, {
    error: 'Use only letters, numbers, underscores, hyphens, colons and dots.',
  })

const RemovedLabelModeSchema = z
  .enum(['remove', 'keep', 'special-label'])
  .meta({
    id: 'RemovedLabelMode',
    description:
      'What happens to a user label once that user drops the content',
  })

const PlexLabelTagSyncSchema = z.object({
  enabled: z.boolean(),
  syncRadarrTags: z.boolean(),
  syncSonarrTags: z.boolean(),
})

export const PlexLabelSyncConfigSchema = z
  .object({
    enabled: z.boolean(),
    labelPrefix: z.string(),
    labelNamingSource: UserNamingSourceSchema,
    cleanupOrphanedLabels: z.boolean(),
    removedLabelMode: RemovedLabelModeSchema,
    removedLabelPrefix: z.string(),
    autoResetOnScheduledSync: z.boolean(),
    tagSync: PlexLabelTagSyncSchema,
  })
  .meta({
    id: 'PlexLabelSyncConfig',
    description:
      'How Plex labels are synced from user watchlists, always returned with defaults filled in',
  })

export const PlexLabelSyncConfigPayloadSchema = z
  .object({
    enabled: z.boolean(),
    labelPrefix: LabelPrefixSchema,
    labelNamingSource: UserNamingSourceSchema,
    cleanupOrphanedLabels: z.boolean(),
    removedLabelMode: RemovedLabelModeSchema,
    removedLabelPrefix: LabelPrefixSchema,
    autoResetOnScheduledSync: z.boolean(),
    tagSync: PlexLabelTagSyncSchema,
  })
  .meta({
    id: 'PlexLabelSyncConfigPayload',
    description:
      'Writable Plex label sync settings. Send the whole object, it replaces the stored one.',
  })

export const PLEX_LABEL_CONCURRENCY = 5

export type PlexLabelSyncConfig = z.infer<typeof PlexLabelSyncConfigSchema>

export const PLEX_LABEL_SYNC_DEFAULTS: PlexLabelSyncConfig = {
  enabled: false,
  labelPrefix: 'pulsarr',
  labelNamingSource: 'username',
  cleanupOrphanedLabels: false,
  removedLabelMode: 'remove',
  removedLabelPrefix: 'pulsarr:removed',
  autoResetOnScheduledSync: false,
  tagSync: {
    enabled: false,
    syncRadarrTags: true,
    syncSonarrTags: true,
  },
}
