import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

const BaseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

const SyncOperationResultSchema = z.object({
  processed: z.number(),
  updated: z.number(),
  failed: z.number(),
  pending: z.number(),
})

export const SyncPlexLabelsResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('sync'),
  results: SyncOperationResultSchema,
})

export const CleanupPlexLabelsResponseSchema = BaseResponseSchema.extend({
  pending: z.object({
    removed: z.number(),
    failed: z.number(),
  }),
  orphaned: z.object({
    removed: z.number(),
    failed: z.number(),
  }),
})

const RemoveOperationResultSchema = z.object({
  processed: z.number(),
  removed: z.number(),
  failed: z.number(),
})

export const RemoveLabelsRequestSchema = z.object({})

export const RemovePlexLabelsResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('remove'),
  results: RemoveOperationResultSchema,
})

export const PlexLabelingOperationResponseSchema = z.discriminatedUnion(
  'mode',
  [SyncPlexLabelsResponseSchema, RemovePlexLabelsResponseSchema],
)

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
export type PlexLabelingOperationResponse = z.infer<
  typeof PlexLabelingOperationResponseSchema
>
