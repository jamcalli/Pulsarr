import { z } from 'zod'

// Configuration schema for user tagging
export const TaggingConfigSchema = z.object({
  tagUsersInSonarr: z.boolean(),
  tagUsersInRadarr: z.boolean(),
  cleanupOrphanedTags: z.boolean(),
  removedTagMode: z.enum(['remove', 'keep', 'special-tag']).default('remove'),
  // Despite the name, this is the complete tag label, not just a prefix
  removedTagPrefix: z
    .string()
    .min(1, { message: 'Removed tag label cannot be empty' })
    .regex(/^[a-zA-Z0-9_\-:.]+$/, {
      message:
        'Removed tag label can only contain letters, numbers, underscores, hyphens, colons, and dots',
    })
    .default('pulsarr:removed'),
  tagPrefix: z
    .string()
    .min(1, { message: 'Tag prefix cannot be empty' })
    .regex(/^[a-zA-Z0-9_\-:.]+$/, {
      message:
        'Tag prefix can only contain letters, numbers, underscores, hyphens, colons, and dots',
    }),
})

// Generic error schema
export const ErrorSchema = z.object({
  message: z.string(),
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
