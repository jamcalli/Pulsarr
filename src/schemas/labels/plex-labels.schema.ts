import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

const RemovalCountSchema = z.object({
  removed: z.number(),
  failed: z.number(),
})

export const SyncPlexLabelsResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    mode: z.literal('sync'),
    results: z.object({
      processed: z.number(),
      updated: z.number(),
      failed: z.number(),
      pending: z.number(),
    }),
  })
  .meta({
    id: 'SyncPlexLabelsResponse',
    description:
      'Result of a full label sync. Pending counts items not in Plex yet.',
  })

export const CleanupPlexLabelsResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    pending: RemovalCountSchema,
    orphaned: RemovalCountSchema,
  })
  .meta({
    id: 'CleanupPlexLabelsResponse',
    description:
      'Result of a label cleanup: expired pending syncs and orphaned labels removed',
  })

export const RemovePlexLabelsResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    mode: z.literal('remove'),
    results: z.object({
      processed: z.number(),
      removed: z.number(),
      failed: z.number(),
    }),
  })
  .meta({
    id: 'RemovePlexLabelsResponse',
    description: 'Result of removing every Pulsarr label from Plex',
  })

export { ErrorSchema }

export type SyncPlexLabelsResponse = z.infer<
  typeof SyncPlexLabelsResponseSchema
>
export type CleanupPlexLabelsResponse = z.infer<
  typeof CleanupPlexLabelsResponseSchema
>
export type RemovePlexLabelsResponse = z.infer<
  typeof RemovePlexLabelsResponseSchema
>
