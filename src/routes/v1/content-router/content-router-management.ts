import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  ContentRouterRuleSchema,
  ContentRouterRuleUpdateSchema,
  ContentRouterRuleResponseSchema,
  ContentRouterRuleListResponseSchema,
  ContentRouterRuleErrorSchema,
  ContentRouterRuleToggleSchema,
  ContentRouterRuleSuccessSchema,
  type ContentRouterRule,
} from '@schemas/content-router/content-router.schema.js'
import type { RouterRule } from '@root/types/router.types.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all router rules
  fastify.get<{
    Reply: z.infer<typeof ContentRouterRuleListResponseSchema>
  }>(
    '/rules',
    {
      schema: {
        response: {
          200: ContentRouterRuleListResponseSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const rules = await fastify.db.getAllRouterRules()

        const response = {
          success: true,
          message: 'Router rules retrieved successfully',
          rules,
        }

        return response
      } catch (err) {
        fastify.log.error('Error retrieving router rules:', err)
        throw reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  // Get router rules by type
  fastify.get<{
    Params: { type: string }
    Querystring: { enabledOnly?: boolean }
    Reply: z.infer<typeof ContentRouterRuleListResponseSchema>
  }>(
    '/rules/type/:type',
    {
      schema: {
        params: z.object({
          type: z.string(),
        }),
        querystring: z.object({
          enabledOnly: z.boolean().optional().default(true),
        }),
        response: {
          200: ContentRouterRuleListResponseSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { type } = request.params
        const { enabledOnly } = request.query

        const rules = await fastify.db.getRouterRulesByType(type, enabledOnly)

        const response = {
          success: true,
          message: `Router rules of type '${type}' retrieved successfully`,
          rules,
        }

        return response
      } catch (err) {
        fastify.log.error(
          `Error retrieving router rules of type '${request.params.type}':`,
          err,
        )
        throw reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  // Get router rules by target
  fastify.get<{
    Querystring: {
      targetType: 'sonarr' | 'radarr'
      instanceId: number
    }
    Reply: z.infer<typeof ContentRouterRuleListResponseSchema>
  }>(
    '/rules/target',
    {
      schema: {
        querystring: z.object({
          targetType: z.enum(['sonarr', 'radarr']),
          instanceId: z.coerce.number(),
        }),
        response: {
          200: ContentRouterRuleListResponseSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { targetType, instanceId } = request.query

        const rules = await fastify.db.getRouterRulesByTarget(
          targetType,
          instanceId,
        )

        const response = {
          success: true,
          message: `Router rules for ${targetType} instance ${instanceId} retrieved successfully`,
          rules,
        }

        return response
      } catch (err) {
        fastify.log.error('Error retrieving router rules by target:', err)
        throw reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  // Get router rule by ID
  fastify.get<{
    Params: { id: number }
    Reply: z.infer<typeof ContentRouterRuleResponseSchema>
  }>(
    '/rules/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number(),
        }),
        response: {
          200: ContentRouterRuleResponseSchema,
          404: ContentRouterRuleErrorSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        const rule = await fastify.db.getRouterRuleById(id)

        if (!rule) {
          throw reply.notFound(`Router rule with ID ${id} not found`)
        }

        const response = {
          success: true,
          message: 'Router rule retrieved successfully',
          rule,
        }

        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error(
          `Error retrieving router rule with ID ${request.params.id}:`,
          err,
        )
        throw reply.internalServerError('Unable to retrieve router rule')
      }
    },
  )

  fastify.get<{
    Params: { targetType: 'sonarr' | 'radarr' }
    Reply: z.infer<typeof ContentRouterRuleListResponseSchema>
  }>(
    '/rules/target/:targetType',
    {
      schema: {
        params: z.object({
          targetType: z.enum(['sonarr', 'radarr']),
        }),
        response: {
          200: ContentRouterRuleListResponseSchema,
          400: ContentRouterRuleErrorSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { targetType } = request.params

        const rules = await fastify.db.getRouterRulesByTargetType(targetType)

        const response = {
          success: true,
          message: `Router rules for target type '${targetType}' retrieved successfully`,
          rules,
        }

        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error(
          `Error retrieving router rules for target '${request.params.targetType}':`,
          err,
        )
        throw reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  // Create a router rule
  fastify.post<{
    Body: z.infer<typeof ContentRouterRuleSchema>
    Reply: z.infer<typeof ContentRouterRuleResponseSchema>
  }>(
    '/rules',
    {
      schema: {
        body: ContentRouterRuleSchema,
        response: {
          201: ContentRouterRuleResponseSchema,
          400: ContentRouterRuleErrorSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const ruleData = request.body

        // Convert quality_profile from string to number if needed
        const formattedRuleData: Omit<
          RouterRule,
          'id' | 'created_at' | 'updated_at'
        > = {
          ...ruleData,
          quality_profile:
            typeof ruleData.quality_profile === 'string'
              ? Number.parseInt(ruleData.quality_profile, 10)
              : ruleData.quality_profile,
        }

        const createdRule = await fastify.db.createRouterRule(formattedRuleData)

        const response = {
          success: true,
          message: 'Router rule created successfully',
          rule: createdRule,
        }

        reply.status(201)
        return response
      } catch (err) {
        fastify.log.error('Error creating router rule:', err)
        throw reply.internalServerError('Unable to create router rule')
      }
    },
  )

  // Update a router rule
  fastify.put<{
    Params: { id: number }
    Body: z.infer<typeof ContentRouterRuleUpdateSchema>
    Reply: z.infer<typeof ContentRouterRuleResponseSchema>
  }>(
    '/rules/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number(),
        }),
        body: ContentRouterRuleUpdateSchema,
        response: {
          200: ContentRouterRuleResponseSchema,
          404: ContentRouterRuleErrorSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params
        const updates = request.body

        // Check if rule exists
        const existingRule = await fastify.db.getRouterRuleById(id)
        if (!existingRule) {
          throw reply.notFound(`Router rule with ID ${id} not found`)
        }

        const updatesAsRouterRule: Partial<
          Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>
        > = {
          ...updates,
          quality_profile:
            typeof updates.quality_profile === 'string'
              ? Number.parseInt(updates.quality_profile, 10)
              : updates.quality_profile,
        }

        // Update the rule
        const updated = await fastify.db.updateRouterRule(
          id,
          updatesAsRouterRule,
        )

        if (!updated) {
          throw reply.internalServerError(
            `Failed to update router rule with ID ${id}`,
          )
        }

        // Get the updated rule
        const updatedRule = await fastify.db.getRouterRuleById(id)

        if (!updatedRule) {
          throw reply.internalServerError(
            `Failed to retrieve updated router rule with ID ${id}`,
          )
        }

        const response = {
          success: true,
          message: 'Router rule updated successfully',
          rule: updatedRule,
        }

        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error(
          `Error updating router rule with ID ${request.params.id}:`,
          err,
        )
        throw reply.internalServerError('Unable to update router rule')
      }
    },
  )

  // Delete a router rule
  fastify.delete<{
    Params: { id: number }
    Reply: z.infer<typeof ContentRouterRuleSuccessSchema>
  }>(
    '/rules/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number(),
        }),
        response: {
          200: ContentRouterRuleSuccessSchema,
          404: ContentRouterRuleErrorSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        // Check if rule exists
        const existingRule = await fastify.db.getRouterRuleById(id)
        if (!existingRule) {
          throw reply.notFound(`Router rule with ID ${id} not found`)
        }

        // Delete the rule
        const deleted = await fastify.db.deleteRouterRule(id)

        if (!deleted) {
          throw reply.internalServerError(
            `Failed to delete router rule with ID ${id}`,
          )
        }

        const response = {
          success: true,
          message: 'Router rule deleted successfully',
        }

        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error(
          `Error deleting router rule with ID ${request.params.id}:`,
          err,
        )
        throw reply.internalServerError('Unable to delete router rule')
      }
    },
  )

  // Toggle a router rule
  fastify.patch<{
    Params: { id: number }
    Body: z.infer<typeof ContentRouterRuleToggleSchema>
    Reply: z.infer<typeof ContentRouterRuleSuccessSchema>
  }>(
    '/rules/:id/toggle',
    {
      schema: {
        params: z.object({
          id: z.coerce.number(),
        }),
        body: ContentRouterRuleToggleSchema,
        response: {
          200: ContentRouterRuleSuccessSchema,
          404: ContentRouterRuleErrorSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params
        const { enabled } = request.body

        // Check if rule exists
        const existingRule = await fastify.db.getRouterRuleById(id)
        if (!existingRule) {
          throw reply.notFound(`Router rule with ID ${id} not found`)
        }

        // Toggle the rule
        const updated = await fastify.db.toggleRouterRule(id, enabled)

        if (!updated) {
          throw reply.internalServerError(
            `Failed to toggle router rule with ID ${id}`,
          )
        }

        const response = {
          success: true,
          message: `Router rule ${enabled ? 'enabled' : 'disabled'} successfully`,
        }

        return response
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error(
          `Error toggling router rule with ID ${request.params.id}:`,
          err,
        )
        throw reply.internalServerError('Unable to toggle router rule')
      }
    },
  )
}

export default plugin
