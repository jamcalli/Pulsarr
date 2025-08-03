import { z } from 'zod'

// Configuration schema for plex labeling
export const PlexLabelingConfigSchema = z.object({
  enabled: z.boolean(),
  labelPrefix: z.string(),
  concurrencyLimit: z.number().int().min(1).max(20).optional(),
  cleanupOrphanedLabels: z.boolean().optional(),
  removedLabelMode: z
    .enum(['remove', 'keep', 'special-label'])
    .optional()
    .describe(
      'How to handle labels when users are removed: remove=delete labels, keep=preserve labels, special-label=add a special removed label',
    ),
  removedLabelPrefix: z
    .string()
    .optional()
    .describe('Prefix for special labels indicating removed users'),
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
    labelPrefix: z.string(),
    concurrencyLimit: z.number(),
    cleanupOrphanedLabels: z.boolean(),
    removedLabelMode: z.enum(['remove', 'keep', 'special-label']),
    removedLabelPrefix: z.string(),
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
