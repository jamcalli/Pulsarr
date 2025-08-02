import { z } from 'zod'

// Configuration schema for plex labeling
export const PlexLabelingConfigSchema = z.object({
  enabled: z.boolean(),
  labelFormat: z.string(),
  excludeLabels: z.array(z.string()).optional(),
  concurrencyLimit: z.number().int().positive().optional(),
})

// Generic error schema
export const ErrorSchema = z.object({
  message: z.string(),
})

// Status response schema for plex labeling
export const PlexLabelingStatusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  config: z.object({
    enabled: z.boolean(),
    labelFormat: z.string(),
    excludeLabels: z.array(z.string()),
    concurrencyLimit: z.number(),
  }),
})

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

export const RemoveLabelsRequestSchema = z.object({
  deleteAllLabels: z.boolean().optional().default(false),
})

export const RemovePlexLabelsResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('remove'),
  results: RemoveOperationResultSchema,
})

// Union of operation types with proper discrimination
export const PlexLabelingOperationResponseSchema = z.discriminatedUnion(
  'mode',
  [SyncPlexLabelsResponseSchema, RemovePlexLabelsResponseSchema],
)
