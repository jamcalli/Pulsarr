import type { RouterRule } from '@root/types/router.types.js'
import {
  ContentRouterRuleErrorSchema,
  ContentRouterRuleListResponseSchema,
  ContentRouterRuleResponseSchema,
  ContentRouterRuleSchema,
  ContentRouterRuleSuccessSchema,
  ContentRouterRuleToggleSchema,
  ContentRouterRuleUpdateSchema,
} from '@schemas/content-router/content-router.schema.js'
import { formatRule } from '@utils/content-router-formatter.js'
import { logRouteError } from '@utils/route-errors.js'
import { RuleBuilder } from '@utils/rule-builder.js'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all router rules
  fastify.get<{
    Reply: z.infer<typeof ContentRouterRuleListResponseSchema>
  }>(
    '/rules',
    {
      schema: {
        summary: 'Get all router rules',
        operationId: 'getAllRouterRules',
        description:
          'Retrieve all content router rules configured in the system',
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

        // Format rules for API response using the utility function
        const formattedRules = rules.map((rule) =>
          formatRule(rule, fastify.log),
        )

        return {
          success: true,
          message: 'Router rules retrieved successfully',
          rules: formattedRules,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to retrieve router rules',
        })
        return reply.internalServerError('Unable to retrieve router rules')
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
        summary: 'Get router rules by type',
        operationId: 'getRouterRulesByType',
        description: 'Retrieve content router rules filtered by specific type',
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

        // Format rules using the utility function
        const formattedRules = rules.map((rule) =>
          formatRule(rule, fastify.log),
        )

        return {
          success: true,
          message: `Router rules of type '${type}' retrieved successfully`,
          rules: formattedRules,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to retrieve router rules by type',
          type: request.params.type,
        })
        return reply.internalServerError('Unable to retrieve router rules')
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
        summary: 'Get router rules by target',
        operationId: 'getRouterRulesByTarget',
        description:
          'Retrieve content router rules for a specific target instance',
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

        // Format rules using the utility function
        const formattedRules = rules.map((rule) =>
          formatRule(rule, fastify.log),
        )

        return {
          success: true,
          message: `Router rules for ${targetType} instance ${instanceId} retrieved successfully`,
          rules: formattedRules,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to retrieve router rules by target',
          targetType: request.query.targetType,
          instanceId: request.query.instanceId,
        })
        return reply.internalServerError('Unable to retrieve router rules')
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
        summary: 'Get router rule by ID',
        operationId: 'getRouterRuleById',
        description: 'Retrieve a specific content router rule by its ID',
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
          return reply.notFound(`Router rule with ID ${id} not found`)
        }

        // Format rule using the utility function
        const formattedRule = formatRule(rule, fastify.log)

        return {
          success: true,
          message: 'Router rule retrieved successfully',
          rule: formattedRule,
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        logRouteError(fastify.log, request, err, {
          message: 'Failed to retrieve router rule by ID',
          ruleId: request.params.id,
        })
        return reply.internalServerError('Unable to retrieve router rule')
      }
    },
  )

  // Get router rules by target type
  fastify.get<{
    Params: { targetType: 'sonarr' | 'radarr' }
    Reply: z.infer<typeof ContentRouterRuleListResponseSchema>
  }>(
    '/rules/target/:targetType',
    {
      schema: {
        summary: 'Get router rules by target type',
        operationId: 'getRouterRulesByTargetType',
        description:
          'Retrieve content router rules filtered by target application type',
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

        // Format rules using the utility function
        const formattedRules = rules.map((rule) =>
          formatRule(rule, fastify.log),
        )

        return {
          success: true,
          message: `Router rules for target type '${targetType}' retrieved successfully`,
          rules: formattedRules,
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        logRouteError(fastify.log, request, err, {
          message: 'Failed to retrieve router rules by target type',
          targetType: request.params.targetType,
        })
        return reply.internalServerError('Unable to retrieve router rules')
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
        summary: 'Create router rule',
        operationId: 'createRouterRule',
        description:
          'Create a new content router rule with specified conditions and targets',
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

        // Validate target_type-specific fields
        if (
          ruleData.target_type === 'radarr' &&
          ruleData.season_monitoring !== null &&
          ruleData.season_monitoring !== undefined
        ) {
          return reply.badRequest(
            'season_monitoring field is not supported for Radarr rules',
          )
        }

        // Use RuleBuilder to create a properly structured rule
        const builtRule = RuleBuilder.createRule({
          name: ruleData.name,
          target_type: ruleData.target_type,
          target_instance_id: ruleData.target_instance_id,
          condition: ruleData.condition || {
            operator: 'AND',
            conditions: [],
            negate: false,
          },
          root_folder: ruleData.root_folder,
          quality_profile:
            typeof ruleData.quality_profile === 'string'
              ? Number.parseInt(ruleData.quality_profile, 10)
              : ruleData.quality_profile,
          tags: Array.isArray(ruleData.tags) ? ruleData.tags : [],
          order: ruleData.order ?? 50,
          enabled: ruleData.enabled ?? true,
          search_on_add: ruleData.search_on_add,
          season_monitoring: ruleData.season_monitoring,
          series_type: ruleData.series_type,
          always_require_approval: ruleData.always_require_approval,
          bypass_user_quotas: ruleData.bypass_user_quotas,
          approval_reason: ruleData.approval_reason,
        })

        // Prepare the rule for database insertion, ensuring required fields have values
        const formattedRuleData: Omit<
          RouterRule,
          'id' | 'created_at' | 'updated_at'
        > = {
          name: builtRule.name,
          type: 'conditional',
          criteria: builtRule.criteria,
          target_type: builtRule.target_type,
          target_instance_id: builtRule.target_instance_id,
          root_folder: builtRule.root_folder || null,
          quality_profile: builtRule.quality_profile || null,
          tags: builtRule.tags || [],
          order: builtRule.order || 50,
          enabled: builtRule.enabled !== undefined ? builtRule.enabled : true,
          metadata: null,
          search_on_add: ruleData.search_on_add,
          season_monitoring: ruleData.season_monitoring,
          series_type: ruleData.series_type,
          always_require_approval: ruleData.always_require_approval,
          bypass_user_quotas: ruleData.bypass_user_quotas,
          approval_reason: ruleData.approval_reason,
        }

        const createdRule = await fastify.db.createRouterRule(formattedRuleData)

        // Format the response using the utility function
        const formattedRule = formatRule(createdRule, fastify.log)

        reply.status(201)
        return {
          success: true,
          message: 'Router rule created successfully',
          rule: formattedRule,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to create router rule',
          ruleName: request.body.name,
        })
        return reply.internalServerError('Unable to create router rule')
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
        summary: 'Update router rule',
        operationId: 'updateRouterRule',
        description: 'Update an existing content router rule by its ID',
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
          return reply.notFound(`Router rule with ID ${id} not found`)
        }

        // Determine the target_type (either from updates or from existing rule)
        const targetType = updates.target_type || existingRule.target_type

        // Validate target_type-specific fields
        if (
          targetType === 'radarr' &&
          updates.season_monitoring !== null &&
          updates.season_monitoring !== undefined
        ) {
          return reply.badRequest(
            'season_monitoring field is not supported for Radarr rules',
          )
        }

        // Prepare updates for the database
        const updatesAsRouterRule: Partial<
          Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>
        > = {}

        // Copy over simple properties
        if (updates.name !== undefined) updatesAsRouterRule.name = updates.name
        if (updates.target_type !== undefined)
          updatesAsRouterRule.target_type = updates.target_type
        if (updates.target_instance_id !== undefined)
          updatesAsRouterRule.target_instance_id = updates.target_instance_id
        if (updates.root_folder !== undefined)
          updatesAsRouterRule.root_folder = updates.root_folder || null
        if (updates.order !== undefined)
          updatesAsRouterRule.order = updates.order
        if (updates.enabled !== undefined)
          updatesAsRouterRule.enabled = updates.enabled
        if (updates.tags !== undefined)
          updatesAsRouterRule.tags = Array.isArray(updates.tags)
            ? updates.tags
            : []
        if (updates.search_on_add !== undefined)
          updatesAsRouterRule.search_on_add = updates.search_on_add
        if (updates.season_monitoring !== undefined)
          updatesAsRouterRule.season_monitoring = updates.season_monitoring
        if (updates.series_type !== undefined)
          updatesAsRouterRule.series_type = updates.series_type
        if (updates.always_require_approval !== undefined)
          updatesAsRouterRule.always_require_approval =
            updates.always_require_approval
        if (updates.bypass_user_quotas !== undefined)
          updatesAsRouterRule.bypass_user_quotas = updates.bypass_user_quotas
        if (updates.approval_reason !== undefined)
          updatesAsRouterRule.approval_reason = updates.approval_reason

        // Handle quality profile conversion
        if (updates.quality_profile !== undefined) {
          updatesAsRouterRule.quality_profile =
            typeof updates.quality_profile === 'string'
              ? Number.parseInt(updates.quality_profile, 10)
              : updates.quality_profile || null
        }

        // Update condition if provided
        if (updates.condition) {
          updatesAsRouterRule.criteria = {
            condition: updates.condition,
          }
        }

        // Update the rule
        const updated = await fastify.db.updateRouterRule(
          id,
          updatesAsRouterRule,
        )

        if (!updated) {
          return reply.internalServerError(
            `Failed to update router rule with ID ${id}`,
          )
        }

        // Get the updated rule
        const updatedRule = await fastify.db.getRouterRuleById(id)

        if (!updatedRule) {
          return reply.internalServerError(
            `Failed to retrieve updated router rule with ID ${id}`,
          )
        }

        // Format the response using the utility function
        const formattedRule = formatRule(updatedRule, fastify.log)

        return {
          success: true,
          message: 'Router rule updated successfully',
          rule: formattedRule,
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        logRouteError(fastify.log, request, err, {
          message: 'Failed to update router rule',
          ruleId: request.params.id,
        })
        return reply.internalServerError('Unable to update router rule')
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
        summary: 'Delete router rule',
        operationId: 'deleteRouterRule',
        description: 'Delete a content router rule by its ID',
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
          return reply.notFound(`Router rule with ID ${id} not found`)
        }

        // Delete the rule
        const deleted = await fastify.db.deleteRouterRule(id)

        if (!deleted) {
          return reply.internalServerError(
            `Failed to delete router rule with ID ${id}`,
          )
        }

        return {
          success: true,
          message: 'Router rule deleted successfully',
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        logRouteError(fastify.log, request, err, {
          message: 'Failed to delete router rule',
          ruleId: request.params.id,
        })
        return reply.internalServerError('Unable to delete router rule')
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
        summary: 'Toggle router rule',
        operationId: 'toggleRouterRule',
        description: 'Enable or disable a content router rule by its ID',
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
          return reply.notFound(`Router rule with ID ${id} not found`)
        }

        // Toggle the rule
        const updated = await fastify.db.toggleRouterRule(id, enabled)

        if (!updated) {
          return reply.internalServerError(
            `Failed to toggle router rule with ID ${id}`,
          )
        }

        return {
          success: true,
          message: `Router rule ${enabled ? 'enabled' : 'disabled'} successfully`,
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        logRouteError(fastify.log, request, err, {
          message: 'Failed to toggle router rule',
          ruleId: request.params.id,
          enabled: request.body.enabled,
        })
        return reply.internalServerError('Unable to toggle router rule')
      }
    },
  )
}

export default plugin
