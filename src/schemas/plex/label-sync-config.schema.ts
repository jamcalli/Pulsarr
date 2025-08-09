import { z } from 'zod'
import {
  TagPrefixSchema,
  RemovedTagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'

export const PlexLabelSyncConfigSchema = z
  .object({
    // Enable/disable the entire label sync feature
    enabled: z.boolean(),
    // Prefix for label naming (e.g., "pulsarr" results in "pulsarr:username")
    labelPrefix: TagPrefixSchema,
    // Maximum number of concurrent operations during processing
    concurrencyLimit: z.number().int().positive(),
    // Whether to clean up orphaned labels during cleanup operations
    cleanupOrphanedLabels: z.boolean(),
    // How to handle label cleanup when users are removed from content
    removedLabelMode: z
      .enum(['remove', 'keep', 'special-label'])
      .describe(
        'How to handle labels when users are removed: remove=delete labels, keep=preserve labels, special-label=add a special removed label',
      ),
    // Prefix for special "removed" labels (only used in special-label mode)
    removedLabelPrefix: RemovedTagPrefixSchema.optional()
      .default('pulsarr:removed')
      .describe('Prefix for special labels indicating removed users'),
    // Whether to automatically reset labels before syncs
    autoResetOnScheduledSync: z
      .boolean()
      .describe(
        'Automatically reset labels before all sync operations to clean up dangling entries based on current removal mode',
      ),
    // Schedule fields for full sync automation
    scheduleTime: z.coerce.date().optional(),
    dayOfWeek: z.string(),
    // Tag syncing configuration
    tagSync: z.object({
      // Enable/disable tag syncing from Radarr/Sonarr instances
      enabled: z.boolean(),
      // Whether to sync tags from Radarr instances
      syncRadarrTags: z.boolean(),
      // Whether to sync tags from Sonarr instances
      syncSonarrTags: z.boolean(),
    }),
  })
  .refine(
    (v) => v.removedLabelMode !== 'special-label' || v.removedLabelPrefix,
    {
      message:
        'removedLabelPrefix required when removedLabelMode is "special-label"',
    },
  )

export const PlexLabelSyncConfigResponseSchema = z.object({
  success: z.boolean(),
  config: PlexLabelSyncConfigSchema,
})

export const PlexLabelSyncConfigErrorSchema = z.object({
  error: z.string(),
})

// Schema for API endpoints that configure label sync
export const plexLabelSyncConfigSchema = {
  summary: 'Configure Plex label sync settings',
  operationId: 'configurePlexLabelSync',
  description:
    'Configure how Plex labels are synchronized based on user watchlists and content routing',
  tags: ['Plex'],
  body: PlexLabelSyncConfigSchema,
  response: {
    200: PlexLabelSyncConfigResponseSchema,
    400: PlexLabelSyncConfigErrorSchema,
    500: PlexLabelSyncConfigErrorSchema,
  },
}

// Inferred TypeScript types
export type PlexLabelSyncConfig = z.infer<typeof PlexLabelSyncConfigSchema>
export type PlexLabelSyncConfigResponse = z.infer<
  typeof PlexLabelSyncConfigResponseSchema
>
export type PlexLabelSyncConfigError = z.infer<
  typeof PlexLabelSyncConfigErrorSchema
>
