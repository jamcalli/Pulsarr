import {
  AliasReadinessErrorSchema,
  AliasReadinessResponseSchema,
} from '@schemas/users/alias-readiness.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import { normalizeTagLabel } from '@utils/tag-normalization.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/alias-readiness',
    {
      schema: {
        summary: 'Check alias readiness for tag/label naming',
        operationId: 'getAliasReadiness',
        description:
          'Checks sync-enabled users for missing or duplicate aliases before switching to alias-based naming',
        response: {
          200: AliasReadinessResponseSchema,
          500: AliasReadinessErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const allUsers = await fastify.db.getAllUsers()
        const syncEnabled = allUsers.filter((u) => u.can_sync)

        const missingAliasCount = syncEnabled.filter(
          (u) => !u.alias?.trim(),
        ).length

        // Normalize through the same path as tag creation so collisions like
        // "John Doe" and "John_Doe" (both become "john-doe") are caught
        const aliasCounts = new Map<string, number>()
        for (const user of syncEnabled) {
          const resolved = user.alias?.trim() || user.name.trim()
          const key = normalizeTagLabel(resolved)
          aliasCounts.set(key, (aliasCounts.get(key) || 0) + 1)
        }

        let duplicateAliasCount = 0
        for (const count of aliasCounts.values()) {
          if (count > 1) {
            duplicateAliasCount += count
          }
        }

        return {
          success: true,
          message: 'Alias readiness check completed',
          missingAliasCount,
          duplicateAliasCount,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to check alias readiness',
        })
        return reply.internalServerError('Failed to check alias readiness')
      }
    },
  )
}

export default plugin
