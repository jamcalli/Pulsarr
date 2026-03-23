import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import {
  RemovedTagPrefixSchema,
  TagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'
import { z } from 'zod'

export const PlexLabelSyncConfigSchema = z
  .object({
    enabled: z.boolean(),
    // e.g., "pulsarr" results in "pulsarr:username"
    labelPrefix: TagPrefixSchema,
    concurrencyLimit: z
      .number()
      .int()
      .min(1, { error: 'Must be at least 1' })
      .max(20, { error: 'Must be at most 20' }),
    cleanupOrphanedLabels: z.boolean(),
    removedLabelMode: z
      .enum(['remove', 'keep', 'special-label'])
      .describe(
        'How to handle labels when users are removed: remove=delete labels, keep=preserve labels, special-label=add a special removed label',
      ),
    removedLabelPrefix: RemovedTagPrefixSchema.default('pulsarr:removed')
      .optional()
      .describe('Prefix for special labels indicating removed users'),
    autoResetOnScheduledSync: z
      .boolean()
      .describe(
        'Automatically reset labels before all sync operations to clean up dangling entries based on current removal mode',
      ),
    scheduleTime: z.coerce.date().optional(),
    dayOfWeek: z.string(),
    tagSync: z.object({
      enabled: z.boolean(),
      syncRadarrTags: z.boolean(),
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

export const plexLabelSyncConfigSchema = {
  summary: 'Configure Plex label sync settings',
  operationId: 'configurePlexLabelSync',
  description:
    'Configure how Plex labels are synchronized based on user watchlists and content routing',
  tags: ['Plex'],
  body: PlexLabelSyncConfigSchema,
  response: {
    200: PlexLabelSyncConfigResponseSchema,
    400: ErrorSchema,
    500: ErrorSchema,
  },
}

export type PlexLabelSyncConfig = z.infer<typeof PlexLabelSyncConfigSchema>
export type PlexLabelSyncConfigResponse = z.infer<
  typeof PlexLabelSyncConfigResponseSchema
>

export { ErrorSchema as PlexLabelSyncConfigErrorSchema }
export type PlexLabelSyncConfigError = z.infer<typeof ErrorSchema>
