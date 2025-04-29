import { z } from 'zod'

/**
 * Schema for configuration settings
 */
export const TaggingConfigSchema = z
  .object({
    tagUsersInSonarr: z.boolean().optional(),
    tagUsersInRadarr: z.boolean().optional(),
    cleanupOrphanedTags: z.boolean().optional(),
    persistHistoricalTags: z.boolean().optional(),
    tagPrefix: z.string().optional(),
  })
  .partial()

/**
 * Schema for response with tagging configuration
 */
export const TaggingStatusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  config: z.object({
    tagUsersInSonarr: z.boolean(),
    tagUsersInRadarr: z.boolean(),
    cleanupOrphanedTags: z.boolean(),
    persistHistoricalTags: z.boolean(),
    tagPrefix: z.string(),
  }),
})

/**
 * Schema for cleanup results for a single instance type
 */
export const CleanupResultSchema = z.object({
  removed: z.number(),
  skipped: z.number(),
  failed: z.number(),
  instances: z.number(),
})

/**
 * Schema for orphaned tag cleanup results
 */
export const OrphanedCleanupResultSchema = z.object({
  radarr: CleanupResultSchema,
  sonarr: CleanupResultSchema,
})

/**
 * Schema for tagging operation response
 */
export const TaggingOperationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  sonarr: z.union([
    // For tag creation
    z.object({
      created: z.number(),
      skipped: z.number(),
      instances: z.number(),
    }),
    // For tag sync
    z.object({
      tagged: z.number(),
      skipped: z.number(),
      failed: z.number(),
    }),
  ]),
  radarr: z.union([
    // For tag creation
    z.object({
      created: z.number(),
      skipped: z.number(),
      instances: z.number(),
    }),
    // For tag sync
    z.object({
      tagged: z.number(),
      skipped: z.number(),
      failed: z.number(),
    }),
  ]),
  orphanedCleanup: OrphanedCleanupResultSchema.optional(),
})

/**
 * Schema for cleanup response
 */
export const CleanupResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  radarr: CleanupResultSchema,
  sonarr: CleanupResultSchema,
})

/**
 * Schema for error responses
 */
export const ErrorSchema = z.object({
  message: z.string(),
})

// Export the types
export type TaggingConfig = z.infer<typeof TaggingConfigSchema>
export type TaggingStatusResponse = z.infer<typeof TaggingStatusResponseSchema>
export type CleanupResult = z.infer<typeof CleanupResultSchema>
export type OrphanedCleanupResult = z.infer<typeof OrphanedCleanupResultSchema>
export type TaggingOperationResponse = z.infer<
  typeof TaggingOperationResponseSchema
>
export type CleanupResponse = z.infer<typeof CleanupResponseSchema>
export type Error = z.infer<typeof ErrorSchema>
