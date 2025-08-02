import { z } from 'zod'

export const PlexLabelSyncConfigSchema = z.object({
  // Enable/disable the entire label sync feature
  enabled: z.boolean().default(false),
  // Template for label naming (supports variables like {username})
  labelFormat: z.string().default('pulsarr:{username}'),
  // Maximum number of concurrent operations during processing
  concurrencyLimit: z.number().int().positive().default(5),
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
