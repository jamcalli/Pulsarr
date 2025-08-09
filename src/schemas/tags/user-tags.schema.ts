import { z } from 'zod'
import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import {
  TagPrefixSchema,
  RemovedTagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'

// Configuration schema for user tagging
export const TaggingConfigSchema = z
  .object({
    tagUsersInSonarr: z.boolean(),
    tagUsersInRadarr: z.boolean(),
    cleanupOrphanedTags: z.boolean(),
    removedTagMode: z.enum(['remove', 'keep', 'special-tag']).default('remove'),
    // Despite the name, this is the complete tag label, not just a prefix
    removedTagPrefix:
      RemovedTagPrefixSchema.optional().default('pulsarr:removed'),
    tagPrefix: TagPrefixSchema,
  })
  .refine((v) => v.removedTagMode !== 'special-tag' || v.removedTagPrefix, {
    message: 'removedTagPrefix required when removedTagMode is "special-tag"',
  })

// Status response schema - REMOVED: Configuration data is now available through main config system only

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

// Schema for the remove tags response
export const RemoveTagsResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('remove'),
  sonarr: z.object({
    itemsProcessed: z.number(),
    itemsUpdated: z.number(),
    tagsRemoved: z.number(),
    tagsDeleted: z.number(),
    failed: z.number(),
    instances: z.number(),
  }),
  radarr: z.object({
    itemsProcessed: z.number(),
    itemsUpdated: z.number(),
    tagsRemoved: z.number(),
    tagsDeleted: z.number(),
    failed: z.number(),
    instances: z.number(),
  }),
})

export const RemoveTagsRequestSchema = z.object({
  deleteTagDefinitions: z.boolean().optional().default(false),
})

// Union of the two operation types with proper discrimination
export const TaggingOperationResponseSchema = z.discriminatedUnion('mode', [
  CreateTaggingResponseSchema,
  SyncTaggingResponseSchema,
  RemoveTagsResponseSchema,
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

// Re-export shared schemas
export { ErrorSchema }

// Exported TypeScript types
export type TaggingConfig = z.infer<typeof TaggingConfigSchema>
export type CreateTaggingResponse = z.infer<typeof CreateTaggingResponseSchema>
export type SyncTaggingResponse = z.infer<typeof SyncTaggingResponseSchema>
export type RemoveTagsResponse = z.infer<typeof RemoveTagsResponseSchema>
export type RemoveTagsRequest = z.infer<typeof RemoveTagsRequestSchema>
export type TaggingOperationResponse = z.infer<
  typeof TaggingOperationResponseSchema
>
export type CleanupResponse = z.infer<typeof CleanupResponseSchema>
