import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { InstanceTypeSchema } from '@root/schemas/common/instance-type.schema.js'
import {
  RemovedTagPrefixSchema,
  TagPrefixSchema,
} from '@root/schemas/shared/prefix-validation.schema.js'
import { z } from 'zod'

// Configuration schema for user tagging
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
    tagNamingSource: z.enum(['username', 'alias']).default('username'),
  })
  .refine((v) => v.removedTagMode !== 'special-tag' || v.removedTagPrefix, {
    message: 'removedTagPrefix required when removedTagMode is "special-tag"',
  })

const BaseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

const CreateOperationResultSchema = z
  .object({
    created: z.number(),
    skipped: z.number(),
    failed: z.number(),
    instances: z.number(),
  })
  .meta({
    id: 'TagCreateStats',
    description: 'User tag creation counts for one arr type',
  })

export const CreateTaggingResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('create'),
  sonarr: CreateOperationResultSchema,
  radarr: CreateOperationResultSchema,
}).meta({
  id: 'CreateTaggingResponse',
  description: 'Result of creating user tags in Sonarr and Radarr',
})

const SyncOperationResultSchema = z
  .object({
    tagged: z.number(),
    skipped: z.number(),
    failed: z.number(),
  })
  .meta({
    id: 'TagSyncStats',
    description: 'User tag sync counts for one arr type',
  })

const CleanupStatsSchema = z
  .object({
    removed: z.number(),
    skipped: z.number(),
    failed: z.number(),
    instances: z.number(),
  })
  .meta({
    id: 'TagCleanupStats',
    description: 'Orphaned user tag cleanup counts for one arr type',
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
}).meta({
  id: 'SyncTaggingResponse',
  description: 'Result of syncing user tags onto Sonarr and Radarr content',
})

const RemoveTagsStatsSchema = z
  .object({
    itemsProcessed: z.number(),
    itemsUpdated: z.number(),
    tagsRemoved: z.number(),
    tagsDeleted: z.number(),
    failed: z.number(),
    instances: z.number(),
  })
  .meta({
    id: 'RemoveTagsStats',
    description: 'User tag removal counts for one arr type',
  })

export const RemoveTagsResponseSchema = BaseResponseSchema.extend({
  mode: z.literal('remove'),
  sonarr: RemoveTagsStatsSchema,
  radarr: RemoveTagsStatsSchema,
}).meta({
  id: 'RemoveTagsResponse',
  description: 'Result of removing user tags from Sonarr and Radarr content',
})

export const RemoveTagsRequestSchema = z
  .object({
    deleteTagDefinitions: z.boolean().optional().default(false),
  })
  .meta({
    id: 'RemoveTagsPayload',
    description: 'Options for removing user tags',
  })

export const TaggingOperationResponseSchema = z.discriminatedUnion('mode', [
  CreateTaggingResponseSchema,
  SyncTaggingResponseSchema,
  RemoveTagsResponseSchema,
])

export const CleanupResponseSchema = BaseResponseSchema.extend({
  radarr: CleanupStatsSchema,
  sonarr: CleanupStatsSchema,
}).meta({
  id: 'TagCleanupResponse',
  description: 'Result of cleaning up orphaned user tags',
})

const OrphanedRefInstanceResultSchema = z
  .object({
    instanceName: z.string(),
    itemsScanned: z.number(),
    orphanedTagsFound: z.number(),
    itemsUpdated: z.number(),
    error: z.string().optional(),
  })
  .meta({
    id: 'OrphanedTagRefInstanceResult',
    description: 'Orphaned tag reference cleanup result for one instance',
  })

export const CleanupOrphanedRefsResponseSchema = BaseResponseSchema.extend({
  radarr: z.object({}).catchall(OrphanedRefInstanceResultSchema),
  sonarr: z.object({}).catchall(OrphanedRefInstanceResultSchema),
}).meta({
  id: 'CleanupOrphanedTagRefsResponse',
  description:
    'Result of removing references to deleted tags, keyed by instance',
})

const TagStatusInstanceSchema = z
  .object({
    type: InstanceTypeSchema,
    instanceId: z.number(),
    name: z.string(),
    enabled: z.boolean(),
    reachable: z.boolean(),
    tagCount: z.number(),
    taggedItemCount: z.number(),
  })
  .meta({
    id: 'TagStatusInstance',
    description:
      'Pulsarr-owned tag counts (user tags and the removed marker) for one instance; counts are zero and reachable is false when the instance could not be read',
  })

export const TagStatusResponseSchema = z
  .object({
    success: z.boolean(),
    tagsExist: z.boolean(),
    instances: z.array(TagStatusInstanceSchema),
  })
  .meta({
    id: 'TagStatus',
    description:
      'Whether user tags exist on any instance with tagging enabled, with per-instance counts',
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
export type CleanupOrphanedRefsResponse = z.infer<
  typeof CleanupOrphanedRefsResponseSchema
>
