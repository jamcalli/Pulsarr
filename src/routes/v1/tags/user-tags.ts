import {
  CleanupResponseSchema,
  CreateTaggingResponseSchema,
  ErrorSchema,
  RemoveTagsRequestSchema,
  RemoveTagsResponseSchema,
  SyncTaggingResponseSchema,
} from '@schemas/tags/user-tags.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Create user tags in Sonarr and/or Radarr instances
  fastify.post<{
    Reply: z.infer<typeof CreateTaggingResponseSchema>
  }>(
    '/create',
    {
      schema: {
        summary: 'Create user tags',
        operationId: 'createUserTags',
        description: 'Create user tags in Sonarr and Radarr instances',
        response: {
          200: CreateTaggingResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Tags'],
      },
    },
    async (request, reply) => {
      try {
        // Check config first to avoid unnecessary API calls if tagging is disabled
        const config = fastify.config

        // Prepare default results for disabled services
        const sonarrResults = {
          created: 0,
          skipped: 0,
          failed: 0,
          instances: 0,
        }

        const radarrResults = {
          created: 0,
          skipped: 0,
          failed: 0,
          instances: 0,
        }

        // Only make API calls if the respective tagging feature is enabled
        const sonarrPromise = config.tagUsersInSonarr
          ? fastify.userTags.createSonarrUserTags()
          : Promise.resolve({
              created: 0,
              skipped: 0,
              failed: 0,
              instances: 0,
              message: 'Sonarr user tagging is disabled in configuration',
            })

        const radarrPromise = config.tagUsersInRadarr
          ? fastify.userTags.createRadarrUserTags()
          : Promise.resolve({
              created: 0,
              skipped: 0,
              failed: 0,
              instances: 0,
              message: 'Radarr user tagging is disabled in configuration',
            })

        // Execute the enabled operations
        const [sonarrTagResults, radarrTagResults] = await Promise.all([
          sonarrPromise,
          radarrPromise,
        ])

        // Merge results
        Object.assign(sonarrResults, sonarrTagResults)
        Object.assign(radarrResults, radarrTagResults)

        // If both services are disabled, adjust the success message
        const totalCreated = sonarrResults.created + radarrResults.created
        const totalSkipped = sonarrResults.skipped + radarrResults.skipped
        const totalInstances = sonarrResults.instances + radarrResults.instances

        let message: string
        if (!config.tagUsersInSonarr && !config.tagUsersInRadarr) {
          message =
            'Tag creation skipped: user tagging is disabled in configuration'
        } else if (totalCreated === 0 && totalSkipped === 0) {
          message =
            'No tags were created or found (check if instances are configured)'
        } else {
          message = `Created ${totalCreated} user tags across ${totalInstances} instances (${sonarrResults.created + sonarrResults.skipped} Sonarr, ${radarrResults.created + radarrResults.skipped} Radarr tags)`
        }

        return {
          success: true,
          message,
          mode: 'create',
          sonarr: {
            created: sonarrResults.created,
            skipped: sonarrResults.skipped,
            failed: sonarrResults.failed,
            instances: sonarrResults.instances,
          },
          radarr: {
            created: radarrResults.created,
            skipped: radarrResults.skipped,
            failed: radarrResults.failed,
            instances: radarrResults.instances,
          },
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to create user tags',
        })
        return reply.internalServerError('Unable to create user tags')
      }
    },
  )

  // Synchronize content with user tags in Sonarr and Radarr
  fastify.post<{
    Reply: z.infer<typeof SyncTaggingResponseSchema>
  }>(
    '/sync',
    {
      schema: {
        summary: 'Sync user tags',
        operationId: 'syncUserTags',
        description:
          'Synchronize content with user tags in Sonarr and Radarr instances',
        response: {
          200: SyncTaggingResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Tags'],
      },
    },
    async (request, reply) => {
      try {
        // Check config first to see if tagging is enabled at all
        const config = fastify.config

        // If both Sonarr and Radarr tagging are disabled, return early
        if (!config.tagUsersInSonarr && !config.tagUsersInRadarr) {
          return {
            success: false,
            message:
              'Tag synchronization skipped: user tagging is disabled in configuration',
            mode: 'sync',
            sonarr: {
              tagged: 0,
              skipped: 0,
              failed: 0,
            },
            radarr: {
              tagged: 0,
              skipped: 0,
              failed: 0,
            },
            orphanedCleanup: {
              sonarr: {
                skipped: 0,
                failed: 0,
                instances: 0,
                removed: 0,
              },
              radarr: {
                skipped: 0,
                failed: 0,
                instances: 0,
                removed: 0,
              },
            },
          }
        }

        // Proceed with sync operation
        const results = await fastify.userTags.syncAllTags()

        // Calculate totals
        const totalTagged = results.sonarr.tagged + results.radarr.tagged
        const totalSkipped = results.sonarr.skipped + results.radarr.skipped
        const totalFailed = results.sonarr.failed + results.radarr.failed

        let message: string
        if (totalTagged === 0 && totalSkipped === 0 && totalFailed === 0) {
          message =
            'No content found to tag (check if media is added to instances)'
        } else {
          message = `Synchronized tags for ${totalTagged} items (${results.sonarr.tagged} Sonarr, ${results.radarr.tagged} Radarr)`
        }

        return {
          success: true,
          message,
          mode: 'sync',
          sonarr: {
            tagged: results.sonarr.tagged,
            skipped: results.sonarr.skipped,
            failed: results.sonarr.failed,
          },
          radarr: {
            tagged: results.radarr.tagged,
            skipped: results.radarr.skipped,
            failed: results.radarr.failed,
          },
          orphanedCleanup: results.orphanedCleanup,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to sync user tags',
        })
        return reply.internalServerError(
          'Unable to sync user tags with content',
        )
      }
    },
  )

  // Clean up orphaned user tags
  fastify.post<{
    Reply: z.infer<typeof CleanupResponseSchema>
  }>(
    '/cleanup',
    {
      schema: {
        summary: 'Cleanup orphaned tags',
        operationId: 'cleanupOrphanedTags',
        description: 'Clean up orphaned user tags from instances',
        response: {
          200: CleanupResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Tags'],
      },
    },
    async (request, reply) => {
      try {
        // Check if cleanup is enabled
        const config = fastify.config

        // If cleanup is disabled, return early with appropriate message
        if (!config.cleanupOrphanedTags) {
          return {
            success: false,
            message: 'Tag cleanup is disabled in configuration',
            radarr: {
              removed: 0,
              skipped: 0,
              failed: 0,
              instances: 0,
            },
            sonarr: {
              removed: 0,
              skipped: 0,
              failed: 0,
              instances: 0,
            },
          }
        }

        // Proceed with cleanup operation
        const results = await fastify.userTags.cleanupOrphanedUserTags()
        const totalRemoved = results.radarr.removed + results.sonarr.removed
        const totalInstances =
          results.radarr.instances + results.sonarr.instances

        let message: string
        if (totalRemoved === 0) {
          message = 'No orphaned tags found to clean up'
        } else {
          message = `Cleaned up ${totalRemoved} orphaned tags across ${totalInstances} instances`
        }

        return {
          success: true,
          message,
          radarr: results.radarr,
          sonarr: results.sonarr,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to cleanup orphaned tags',
        })
        return reply.internalServerError('Unable to clean up orphaned tags')
      }
    },
  )
  // Remove all user tags from media
  fastify.post<{
    Body: { deleteTagDefinitions?: boolean }
    Reply: z.infer<typeof RemoveTagsResponseSchema>
  }>(
    '/remove',
    {
      schema: {
        summary: 'Remove all user tags',
        operationId: 'removeAllUserTags',
        description:
          'Remove all user tags from media and optionally delete tag definitions',
        body: RemoveTagsRequestSchema,
        response: {
          200: RemoveTagsResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Tags'],
      },
    },
    async (request, reply) => {
      try {
        // Check if tagging is enabled
        const config = fastify.config

        // If both Sonarr and Radarr tagging are disabled, return early
        if (!config.tagUsersInSonarr && !config.tagUsersInRadarr) {
          return {
            success: false,
            message:
              'Tag removal skipped: user tagging is disabled in configuration',
            mode: 'remove',
            sonarr: {
              itemsProcessed: 0,
              itemsUpdated: 0,
              tagsRemoved: 0,
              tagsDeleted: 0,
              failed: 0,
              instances: 0,
            },
            radarr: {
              itemsProcessed: 0,
              itemsUpdated: 0,
              tagsRemoved: 0,
              tagsDeleted: 0,
              failed: 0,
              instances: 0,
            },
          }
        }

        // Extract option from request
        const { deleteTagDefinitions = false } = request.body

        // Call the service to remove all tags
        const results =
          await fastify.userTags.removeAllUserTags(deleteTagDefinitions)

        // Calculate total items and tags for the response message
        const totalItemsUpdated =
          results.sonarr.itemsUpdated + results.radarr.itemsUpdated
        const totalTagsRemoved =
          results.sonarr.tagsRemoved + results.radarr.tagsRemoved
        const totalTagsDeleted =
          results.sonarr.tagsDeleted + results.radarr.tagsDeleted

        // Build appropriate message based on results
        let message = `Removed ${totalTagsRemoved} user tags from ${totalItemsUpdated} items`

        if (deleteTagDefinitions) {
          message += ` and deleted ${totalTagsDeleted} tag definitions`
        }

        if (totalItemsUpdated === 0 && totalTagsRemoved === 0) {
          message = 'No user tags found to remove'
        }

        return {
          success: true,
          message,
          mode: 'remove',
          sonarr: results.sonarr,
          radarr: results.radarr,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to remove user tags',
        })
        return reply.internalServerError('Unable to remove user tags')
      }
    },
  )
}

export default plugin
