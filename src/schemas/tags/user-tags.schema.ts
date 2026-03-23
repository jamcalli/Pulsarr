import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import {
  RemovedTagPrefixSchema,
  TagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'
import { z } from 'zod'

export const TaggingConfigSchema = z
  .object({
    tagUsersInSonarr: z.boolean(),
    tagUsersInRadarr: z.boolean(),
    cleanupOrphanedTags: z.boolean(),
    removedTagMode: z.enum(['remove', 'keep', 'special-tag']).default('remove'),
    // Despite the name, this is the complete tag label, not just a prefix
    removedTagPrefix:
      RemovedTagPrefixSchema.optional().default('pulsarr-removed'),
    tagPrefix: TagPrefixSchema,
  })
  .refine((v) => v.removedTagMode !== 'special-tag' || v.removedTagPrefix, {
    message: 'removedTagPrefix required when removedTagMode is "special-tag"',
  })

const BaseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

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

const SyncOperationResultSchema = z.object({
  tagged: z.number(),
  skipped: z.number(),
  failed: z.number(),
})

const CleanupStatsSchema = z.object({
  removed: z.number(),
  skipped: z.number(),
  failed: z.number(),
  instances: z.number(),
})

export const SyncTaggingResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('sync'),
  sonarr: SyncOperationResultSchema,
  radarr: SyncOperationResultSchema,
  orphanedCleanup: z
    .object({
      radarr: CleanupStatsSchema,
      sonarr: CleanupStatsSchema,
    })
    .optional(),
})

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

export const TaggingOperationResponseSchema = z.discriminatedUnion('mode', [
  CreateTaggingResponseSchema,
  SyncTaggingResponseSchema,
  RemoveTagsResponseSchema,
])

export const CleanupResponseSchema = BaseResponseSchema.extend({
  radarr: CleanupStatsSchema,
  sonarr: CleanupStatsSchema,
})

const OrphanedRefInstanceResultSchema = z.object({
  instanceName: z.string(),
  itemsScanned: z.number(),
  orphanedTagsFound: z.number(),
  itemsUpdated: z.number(),
  error: z.string().optional(),
})

export const CleanupOrphanedRefsResponseSchema = BaseResponseSchema.extend({
  radarr: z.object({}).catchall(OrphanedRefInstanceResultSchema),
  sonarr: z.object({}).catchall(OrphanedRefInstanceResultSchema),
})

export { ErrorSchema }

export type TaggingConfig = z.infer<typeof TaggingConfigSchema>
export type CreateTaggingResponse = z.infer<typeof CreateTaggingResponseSchema>
export type SyncTaggingResponse = z.infer<typeof SyncTaggingResponseSchema>
export type RemoveTagsResponse = z.infer<typeof RemoveTagsResponseSchema>
export type RemoveTagsRequest = z.infer<typeof RemoveTagsRequestSchema>
export type TaggingOperationResponse = z.infer<
  typeof TaggingOperationResponseSchema
>
export type CleanupResponse = z.infer<typeof CleanupResponseSchema>
export type CleanupOrphanedRefsResponse = z.infer<
  typeof CleanupOrphanedRefsResponseSchema
>
