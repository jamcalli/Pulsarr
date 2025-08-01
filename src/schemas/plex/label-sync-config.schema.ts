import { z } from 'zod'

export const PlexLabelSyncConfigSchema = z.object({
  // Enable/disable the entire label sync feature
  enabled: z.boolean().default(false),
  // Live mode - webhook-triggered syncing (real-time updates)
  liveMode: z.boolean().default(true),
  // Batch mode - scheduled full syncs (periodic updates)
  batchMode: z.boolean().default(false),
  // Template for label naming (supports variables like {username})
  labelFormat: z.string().default('pulsarr:{username}'),
  // Interval between batch syncs in seconds
  syncInterval: z.number().int().positive().default(3600),
  // Interval between retry attempts for pending syncs in seconds
  pendingRetryInterval: z.number().int().positive().default(30),
  // Maximum age for pending syncs before expiration in minutes
  pendingMaxAge: z.number().int().positive().default(30),
  // Labels that should never be modified by the sync process
  excludeLabels: z.array(z.string()).default([]),
  // Whether to preserve existing labels when syncing
  preserveExistingLabels: z.boolean().default(true),
  // Whether to label all versions of content (HD, 4K, etc.) or just the first one found
  labelAllVersions: z.boolean().default(true),
})

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
