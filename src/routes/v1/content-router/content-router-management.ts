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
} from '@schemas/content-router/content-router.schema.js'
import {
  RouterRuleWithConditionsSchema,
  RouterRuleWithConditionsResponseSchema,
  RouterRuleErrorSchema,
} from '@schemas/content-router/router-condition.schema.js'
import type {
  CompleteRouterRule,
  RouterCondition,
} from '@root/types/router-query.types.js'

/**
 * Transforms a database router rule to match the expected response schema
 *
 * @param rule - Database router rule with conditions
 * @returns Properly formatted rule for response
 */
/**
 * Transforms a database router rule to match the expected response schema
 *
 * @param rule - Database router rule with conditions
 * @returns Properly formatted rule for response
 */
function formatRuleForResponse(rule: CompleteRouterRule): any {
  // Parse any JSON string values in conditions to objects
  const formattedConditions =
    rule.conditions?.map((condition) => {
      return {
        ...condition,
        // Parse the value if it's a string
        value:
          typeof condition.value === 'string'
            ? JSON.parse(condition.value)
            : condition.value,
      }
    }) || []

  // Return the rule with properly formatted conditions
  return {
    id: rule.id,
    name: rule.name,
    type: rule.type,
    criteria:
      typeof rule.criteria === 'string'
        ? JSON.parse(rule.criteria)
        : rule.criteria,
    target_type: rule.target_type,
    target_instance_id: rule.target_instance_id,
    quality_profile: rule.quality_profile,
    root_folder: rule.root_folder,
    weight: rule.order,
    order: rule.order,
    enabled: Boolean(rule.enabled),
    query_type: rule.query_type || 'legacy',
    created_at: rule.created_at,
    updated_at: rule.updated_at,
    conditions: formattedConditions,
    description: null,
    metadata: rule.metadata || null,
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all router rules (both legacy and query-builder)
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
        const rulesFromDb = await fastify.db.getAllRouterRules()

        const response = {
          success: true,
          message: 'Router rules retrieved successfully',
          rules: rulesFromDb.map(formatRuleForResponse),
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

        const rulesFromDb = await fastify.db.getRouterRulesByType(
          type,
          enabledOnly,
        )

        const response = {
          success: true,
          message: `Router rules of type '${type}' retrieved successfully`,
          rules: rulesFromDb.map(formatRuleForResponse),
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

        const rulesFromDb = await fastify.db.getRouterRulesByTarget(
          targetType,
          instanceId,
        )

        const response = {
          success: true,
          message: `Router rules for ${targetType} instance ${instanceId} retrieved successfully`,
          rules: rulesFromDb.map(formatRuleForResponse),
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
    Reply: z.infer<typeof RouterRuleWithConditionsResponseSchema>
  }>(
    '/rules/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number(),
        }),
        response: {
          200: RouterRuleWithConditionsResponseSchema,
          404: RouterRuleErrorSchema,
          500: RouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        const ruleFromDb = await fastify.db.getRouterRuleById(id)

        if (!ruleFromDb) {
          throw reply.notFound(`Router rule with ID ${id} not found`)
        }

        return {
          success: true,
          message: 'Router rule retrieved successfully',
          rule: formatRuleForResponse(ruleFromDb),
        }
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

        const rulesFromDb = await fastify.db.getRulesByTargetType(targetType)

        const response = {
          success: true,
          message: `Router rules for target type '${targetType}' retrieved successfully`,
          rules: rulesFromDb.map(formatRuleForResponse),
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

  // Create a query-builder router rule with conditions
  fastify.post<{
    Body: z.infer<typeof RouterRuleWithConditionsSchema>
    Reply: z.infer<typeof RouterRuleWithConditionsResponseSchema>
  }>(
    '/query-rules',
    {
      schema: {
        body: RouterRuleWithConditionsSchema,
        response: {
          201: RouterRuleWithConditionsResponseSchema,
          400: RouterRuleErrorSchema,
          500: RouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const {
          name,
          description,
          target_type,
          target_instance_id,
          quality_profile,
          root_folder,
          weight,
          enabled,
          conditions,
        } = request.body

        type BaseCondition = {
          id?: number
          order_index?: number
        }

        type GroupCondition = BaseCondition & {
          predicate_type: 'group'
          group_operator: 'AND' | 'OR' | 'NOT'
          parent_group_id: number | null
        }

        type RegularCondition = BaseCondition & {
          predicate_type: string
          operator: string
          value: any
          group_id: number | null
        }

        // Create the rule with conditions
        const ruleFromDb = await fastify.db.createRouterRule(
          {
            name,
            description,
            type: 'query-builder',
            target_type,
            target_instance_id,
            quality_profile,
            root_folder,
            weight,
            enabled,
            query_type: 'query-builder',
          },
          conditions?.map((condition) => {
            if (condition.predicate_type === 'group') {
              return {
                id: Number(condition.id),
                predicate_type: 'group',
                group_operator: condition.group_operator,
                parent_group_id: condition.parent_group_id
                  ? Number(condition.parent_group_id)
                  : null,
                order_index: Number(condition.order_index),
              } as GroupCondition
            }
            return {
              id: Number(condition.id),
              predicate_type: condition.predicate_type,
              operator: condition.operator,
              value: condition.value,
              group_id: condition.group_id ? Number(condition.group_id) : null,
              order_index: Number(condition.order_index),
            } as RegularCondition
          }) || [],
        )

        reply.status(201)
        return {
          success: true,
          message: 'Query router rule created successfully',
          rule: formatRuleForResponse(ruleFromDb),
        }
      } catch (err) {
        fastify.log.error('Error creating query router rule:', err)
        throw reply.internalServerError('Unable to create query router rule')
      }
    },
  )

  // Create a legacy router rule
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
          CompleteRouterRule,
          'id' | 'created_at' | 'updated_at'
        > = {
          ...ruleData,
          type: ruleData.type,
          quality_profile:
            typeof ruleData.quality_profile === 'string'
              ? Number.parseInt(ruleData.quality_profile, 10)
              : ruleData.quality_profile,
          query_type: 'legacy', // Ensure it's marked as a legacy rule
        }

        const ruleFromDb = await fastify.db.createRouterRule(formattedRuleData)

        const response = {
          success: true,
          message: 'Legacy router rule created successfully',
          rule: formatRuleForResponse(ruleFromDb),
        }

        reply.status(201)
        return response
      } catch (err) {
        fastify.log.error('Error creating legacy router rule:', err)
        throw reply.internalServerError('Unable to create legacy router rule')
      }
    },
  )

  // Update a query-builder rule with conditions
  fastify.put<{
    Params: { id: number }
    Body: z.infer<typeof RouterRuleWithConditionsSchema>
    Reply: z.infer<typeof RouterRuleWithConditionsResponseSchema>
  }>(
    '/query-rules/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number(),
        }),
        body: RouterRuleWithConditionsSchema,
        response: {
          200: RouterRuleWithConditionsResponseSchema,
          404: RouterRuleErrorSchema,
          500: RouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params
        const {
          name,
          description,
          target_instance_id,
          quality_profile,
          root_folder,
          weight,
          enabled,
          conditions,
        } = request.body

        // Check if rule exists
        const existingRule = await fastify.db.getRouterRuleById(id)
        if (!existingRule) {
          throw reply.notFound(`Router rule with ID ${id} not found`)
        }

        // Update rule properties
        await fastify.db.updateRouterRule(id, {
          name,
          description,
          target_instance_id,
          quality_profile,
          root_folder,
          weight,
          enabled,
        })

        // Update conditions if provided
        let updatedRuleFromDb = await fastify.db.getRouterRuleById(id)
        if (conditions && conditions.length > 0) {
          updatedRuleFromDb = await fastify.db.updateRouterRuleConditions(
            id,
            conditions.map((condition) => ({
              id: condition.id ? Number(condition.id) : undefined,
              predicate_type: condition.predicate_type as string,
              operator: condition.operator as string,
              value: condition.value,
              group_id: condition.group_id ? Number(condition.group_id) : null,
              group_operator: condition.group_operator as string | null,
              parent_group_id: condition.parent_group_id
                ? Number(condition.parent_group_id)
                : null,
              order_index: condition.order_index
                ? Number(condition.order_index)
                : undefined,
            })),
          )
        }

        if (!updatedRuleFromDb) {
          throw reply.internalServerError(
            `Failed to retrieve updated rule with ID ${id}`,
          )
        }

        return {
          success: true,
          message: 'Router rule updated successfully',
          rule: formatRuleForResponse(updatedRuleFromDb),
        }
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

  // Update a legacy router rule
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

        const updatesFormatted = {
          ...updates,
          quality_profile:
            typeof updates.quality_profile === 'string'
              ? Number.parseInt(updates.quality_profile, 10)
              : updates.quality_profile,
        }

        // Update the rule
        const updated = await fastify.db.updateRouterRule(id, updatesFormatted)

        if (!updated) {
          throw reply.internalServerError(
            `Failed to update router rule with ID ${id}`,
          )
        }

        // Get the updated rule
        const updatedRuleFromDb = await fastify.db.getRouterRuleById(id)

        if (!updatedRuleFromDb) {
          throw reply.internalServerError(
            `Failed to retrieve updated router rule with ID ${id}`,
          )
        }

        const response = {
          success: true,
          message: 'Router rule updated successfully',
          rule: formatRuleForResponse(updatedRuleFromDb),
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

  // Delete a router rule (works for both legacy and query-builder)
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

  // Toggle a router rule (works for both legacy and query-builder)
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
