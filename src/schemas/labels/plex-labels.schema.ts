import { z } from 'zod'
import { ErrorSchema } from '@schemas/common/error.schema.js'

// Base response schema with common fields
const BaseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Sync operation result schema
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

// Cleanup response schema for plex labels
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

// Remove operation result schema
const RemoveOperationResultSchema = z.object({
  processed: z.number(),
  removed: z.number(),
  failed: z.number(),
})

// Empty schema - no parameters needed for removing all Pulsarr labels
export const RemoveLabelsRequestSchema = z.object({})

export const RemovePlexLabelsResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('remove'),
  results: RemoveOperationResultSchema,
})

// Union of operation types with proper discrimination
export const PlexLabelingOperationResponseSchema = z.discriminatedUnion(
  'mode',
  [SyncPlexLabelsResponseSchema, RemovePlexLabelsResponseSchema],
)

// Re-export shared schemas
export { ErrorSchema }
