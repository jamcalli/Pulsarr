import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  TaggingStatusResponseSchema,
  TaggingOperationResponseSchema,
  CleanupResponseSchema,
  TaggingConfigSchema,
  ErrorSchema,
} from '@schemas/tags/user-tags.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get tagging configuration status
  fastify.get<{
    Reply: z.infer<typeof TaggingStatusResponseSchema>
  }>(
    '/status',
    {
      schema: {
        response: {
          200: TaggingStatusResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Tags'],
      },
    },
    async (request, reply) => {
      try {
        const config = await fastify.db.getConfig(1)
        if (!config) {
          throw reply.notFound('Config not found in database')
        }

        return {
          success: true,
          message: 'Tagging configuration retrieved successfully',
          config: {
            tagUsersInSonarr: Boolean(config.tagUsersInSonarr),
            tagUsersInRadarr: Boolean(config.tagUsersInRadarr),
            cleanupOrphanedTags: Boolean(config.cleanupOrphanedTags),
            persistHistoricalTags: Boolean(config.persistHistoricalTags),
            tagPrefix: config.tagPrefix || 'pulsarr:user',
          },
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error fetching tagging configuration:', err)
        throw reply.internalServerError('Unable to fetch tagging configuration')
      }
    },
  )

  // Update tagging configuration
  fastify.put<{
    Body: z.infer<typeof TaggingConfigSchema>
    Reply: z.infer<typeof TaggingStatusResponseSchema>
  }>(
    '/config',
    {
      schema: {
        body: TaggingConfigSchema,
        response: {
          200: TaggingStatusResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Tags'],
      },
    },
    async (request, reply) => {
      try {
        // Create a copy of the config updates
        const configUpdate = { ...request.body }

        // Validate tag prefix if provided
        if (configUpdate.tagPrefix !== undefined) {
          if (configUpdate.tagPrefix.trim() === '') {
            throw reply.badRequest('Tag prefix cannot be empty')
          }

          // Check if prefix contains only allowed characters
          if (!/^[a-zA-Z0-9_-]+$/.test(configUpdate.tagPrefix)) {
            throw reply.badRequest(
              'Tag prefix can only contain letters, numbers, underscores, and hyphens',
            )
          }
        }

        // Update the database config
        const dbUpdated = await fastify.db.updateConfig(1, configUpdate)
        if (!dbUpdated) {
          throw reply.badRequest('Failed to update configuration')
        }

        // Get the updated config
        const savedConfig = await fastify.db.getConfig(1)
        if (!savedConfig) {
          throw reply.notFound('No configuration found after update')
        }

        // Update the runtime config
        await fastify.updateConfig(configUpdate)

        // Return the updated config
        return {
          success: true,
          message: 'Tagging configuration updated successfully',
          config: {
            tagUsersInSonarr: Boolean(savedConfig.tagUsersInSonarr),
            tagUsersInRadarr: Boolean(savedConfig.tagUsersInRadarr),
            cleanupOrphanedTags: Boolean(savedConfig.cleanupOrphanedTags),
            persistHistoricalTags: Boolean(savedConfig.persistHistoricalTags),
            tagPrefix: savedConfig.tagPrefix || 'pulsarr:user',
          },
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error updating tagging configuration:', err)
        throw reply.internalServerError(
          'Unable to update tagging configuration',
        )
      }
    },
  )

  // Create user tags in Sonarr and/or Radarr instances
  fastify.post<{
    Reply: z.infer<typeof TaggingOperationResponseSchema>
  }>(
    '/create',
    {
      schema: {
        response: {
          200: TaggingOperationResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Tags'],
      },
    },
    async (request, reply) => {
      try {
        const [sonarrResults, radarrResults] = await Promise.all([
          fastify.userTags.createSonarrUserTags(),
          fastify.userTags.createRadarrUserTags(),
        ])

        const totalCreated = sonarrResults.created + radarrResults.created
        const totalSkipped = sonarrResults.skipped + radarrResults.skipped
        const totalInstances = sonarrResults.instances + radarrResults.instances

        return {
          success: true,
          message: `Created ${totalCreated} user tags across ${totalInstances} instances (${sonarrResults.created + sonarrResults.skipped} Sonarr, ${radarrResults.created + radarrResults.skipped} Radarr tags)`,
          sonarr: {
            created: sonarrResults.created,
            skipped: sonarrResults.skipped,
            instances: sonarrResults.instances,
          },
          radarr: {
            created: radarrResults.created,
            skipped: radarrResults.skipped,
            instances: radarrResults.instances,
          },
        }
      } catch (err) {
        fastify.log.error('Error creating user tags:', err)
        throw reply.internalServerError('Unable to create user tags')
      }
    },
  )

  // Synchronize content with user tags in Sonarr and Radarr
  fastify.post<{
    Reply: z.infer<typeof TaggingOperationResponseSchema>
  }>(
    '/sync',
    {
      schema: {
        response: {
          200: TaggingOperationResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Tags'],
      },
    },
    async (request, reply) => {
      try {
        const results = await fastify.userTags.syncAllTags()

        // Calculate totals
        const totalTagged = results.sonarr.tagged + results.radarr.tagged
        const totalSkipped = results.sonarr.skipped + results.radarr.skipped
        const totalFailed = results.sonarr.failed + results.radarr.failed

        return {
          success: true,
          message: `Synchronized tags for ${totalTagged} items (${results.sonarr.tagged} Sonarr, ${results.radarr.tagged} Radarr)`,
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
        fastify.log.error('Error syncing user tags:', err)
        throw reply.internalServerError('Unable to sync user tags with content')
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
        const config = await fastify.db.getConfig(1)
        if (!config || !config.cleanupOrphanedTags) {
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

        const results = await fastify.userTags.cleanupOrphanedUserTags()
        const totalRemoved = results.radarr.removed + results.sonarr.removed
        const totalInstances =
          results.radarr.instances + results.sonarr.instances

        return {
          success: true,
          message: `Cleaned up ${totalRemoved} orphaned tags across ${totalInstances} instances`,
          radarr: results.radarr,
          sonarr: results.sonarr,
        }
      } catch (err) {
        fastify.log.error('Error cleaning up orphaned tags:', err)
        throw reply.internalServerError('Unable to clean up orphaned tags')
      }
    },
  )
}

export default plugin
