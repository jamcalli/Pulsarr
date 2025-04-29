import { z } from 'zod'

// Configuration schema for user tagging
export const TaggingConfigSchema = z.object({
  tagUsersInSonarr: z.boolean(),
  tagUsersInRadarr: z.boolean(),
  cleanupOrphanedTags: z.boolean(),
  persistHistoricalTags: z.boolean(),
  tagPrefix: z.string(),
})

// Generic error schema
export const ErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
})

// Status response schema
export const TaggingStatusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  config: z.object({
    tagUsersInSonarr: z.boolean(),
    tagUsersInRadarr: z.boolean(),
    cleanupOrphanedTags: z.boolean(),
    persistHistoricalTags: z.boolean(),
    tagPrefix: z.string(),
  }),
})

// Base response schema with common fields
const BaseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Create operation schemas with discriminant
const CreateOperationResultSchema = z.object({
  created: z.number(),
  skipped: z.number(),
  failed: z.number(),
  instances: z.number(),
})

export const CreateTaggingResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('create'),
  sonarr: CreateOperationResultSchema,
  radarr: CreateOperationResultSchema,
})

// Sync operation schemas with discriminant
const SyncOperationResultSchema = z.object({
  tagged: z.number(),
  skipped: z.number(),
  failed: z.number(),
})

export const SyncTaggingResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('sync'),
  sonarr: SyncOperationResultSchema,
  radarr: SyncOperationResultSchema,
  orphanedCleanup: z
    .object({
      radarr: z.object({
        removed: z.number(),
        skipped: z.number(),
        failed: z.number(),
        instances: z.number(),
      }),
      sonarr: z.object({
        removed: z.number(),
        skipped: z.number(),
        failed: z.number(),
        instances: z.number(),
      }),
    })
    .optional(),
})

// Union of the two operation types with proper discrimination
export const TaggingOperationResponseSchema = z.discriminatedUnion('mode', [
  CreateTaggingResponseSchema,
  SyncTaggingResponseSchema,
])

// Cleanup response schema
export const CleanupResponseSchema = BaseResponseSchema.extend({
  radarr: z.object({
    removed: z.number(),
    skipped: z.number(),
    failed: z.number(),
    instances: z.number(),
  }),
  sonarr: z.object({
    removed: z.number(),
    skipped: z.number(),
    failed: z.number(),
    instances: z.number(),
  }),
})
