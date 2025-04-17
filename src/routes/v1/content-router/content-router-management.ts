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
import { RuleBuilder } from '@utils/rule-builder.js'

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

        // Format rules for API response
        const formattedRules = rules.map((rule) => {
          try {
            // Extract condition from criteria
            const criteria =
              typeof rule.criteria === 'string'
                ? JSON.parse(rule.criteria)
                : rule.criteria || {}

            // Ensure fields match the expected response structure
            return {
              id: rule.id,
              name: rule.name,
              target_type: rule.target_type,
              target_instance_id: rule.target_instance_id,
              root_folder: rule.root_folder || undefined,
              quality_profile:
                rule.quality_profile !== null
                  ? rule.quality_profile
                  : undefined,
              order: rule.order,
              enabled: Boolean(rule.enabled),
              condition: criteria.condition,
              created_at: rule.created_at,
              updated_at: rule.updated_at,
            }
          } catch (parseError) {
            // Log the error specifically for this rule
            fastify.log.error(
              `Error parsing criteria for rule ID ${rule.id}:`,
              parseError,
            )

            // Return the rule with an empty condition to avoid breaking the entire response
            return {
              id: rule.id,
              name: rule.name,
              target_type: rule.target_type,
              target_instance_id: rule.target_instance_id,
              root_folder: rule.root_folder || undefined,
              quality_profile:
                rule.quality_profile !== null
                  ? rule.quality_profile
                  : undefined,
              order: rule.order,
              enabled: Boolean(rule.enabled),
              condition: undefined,
              created_at: rule.created_at,
              updated_at: rule.updated_at,
            }
          }
        })

        return {
          success: true,
          message: 'Router rules retrieved successfully',
          rules: formattedRules,
        }
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

        // Format rules to match expected response structure
        const formattedRules = rules.map((rule) => {
          try {
            const criteria =
              typeof rule.criteria === 'string'
                ? JSON.parse(rule.criteria)
                : rule.criteria || {}

            return {
              id: rule.id,
              name: rule.name,
              target_type: rule.target_type,
              target_instance_id: rule.target_instance_id,
              root_folder: rule.root_folder || undefined,
              quality_profile:
                rule.quality_profile !== null
                  ? rule.quality_profile
                  : undefined,
              order: rule.order,
              enabled: Boolean(rule.enabled),
              condition: criteria.condition,
              created_at: rule.created_at,
              updated_at: rule.updated_at,
            }
          } catch (parseError) {
            fastify.log.error(
              `Error parsing criteria for rule ID ${rule.id}:`,
              parseError,
            )

            return {
              id: rule.id,
              name: rule.name,
              target_type: rule.target_type,
              target_instance_id: rule.target_instance_id,
              root_folder: rule.root_folder || undefined,
              quality_profile:
                rule.quality_profile !== null
                  ? rule.quality_profile
                  : undefined,
              order: rule.order,
              enabled: Boolean(rule.enabled),
              condition: undefined,
              created_at: rule.created_at,
              updated_at: rule.updated_at,
            }
          }
        })

        return {
          success: true,
          message: `Router rules of type '${type}' retrieved successfully`,
          rules: formattedRules,
        }
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

        // Format rules to match expected response structure
        const formattedRules = rules.map((rule) => {
          try {
            const criteria =
              typeof rule.criteria === 'string'
                ? JSON.parse(rule.criteria)
                : rule.criteria || {}

            return {
              id: rule.id,
              name: rule.name,
              target_type: rule.target_type,
              target_instance_id: rule.target_instance_id,
              root_folder: rule.root_folder || undefined,
              quality_profile:
                rule.quality_profile !== null
                  ? rule.quality_profile
                  : undefined,
              order: rule.order,
              enabled: Boolean(rule.enabled),
              condition: criteria.condition,
              created_at: rule.created_at,
              updated_at: rule.updated_at,
            }
          } catch (parseError) {
            fastify.log.error(
              `Error parsing criteria for rule ID ${rule.id}:`,
              parseError,
            )

            return {
              id: rule.id,
              name: rule.name,
              target_type: rule.target_type,
              target_instance_id: rule.target_instance_id,
              root_folder: rule.root_folder || undefined,
              quality_profile:
                rule.quality_profile !== null
                  ? rule.quality_profile
                  : undefined,
              order: rule.order,
              enabled: Boolean(rule.enabled),
              condition: undefined,
              created_at: rule.created_at,
              updated_at: rule.updated_at,
            }
          }
        })

        return {
          success: true,
          message: `Router rules for ${targetType} instance ${instanceId} retrieved successfully`,
          rules: formattedRules,
        }
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

        // Format rule to match expected response structure
        let formattedRule: ContentRouterRule
        try {
          const criteria =
            typeof rule.criteria === 'string'
              ? JSON.parse(rule.criteria)
              : rule.criteria || {}

          formattedRule = {
            id: rule.id,
            name: rule.name,
            target_type: rule.target_type,
            target_instance_id: rule.target_instance_id,
            root_folder: rule.root_folder || undefined,
            quality_profile:
              rule.quality_profile !== null ? rule.quality_profile : undefined,
            order: rule.order,
            enabled: Boolean(rule.enabled),
            condition: criteria.condition,
            created_at: rule.created_at,
            updated_at: rule.updated_at,
          }
        } catch (parseError) {
          fastify.log.error(
            `Error parsing criteria for rule ID ${rule.id}:`,
            parseError,
          )

          formattedRule = {
            id: rule.id,
            name: rule.name,
            target_type: rule.target_type,
            target_instance_id: rule.target_instance_id,
            root_folder: rule.root_folder || undefined,
            quality_profile:
              rule.quality_profile !== null ? rule.quality_profile : undefined,
            order: rule.order,
            enabled: Boolean(rule.enabled),
            condition: undefined,
            created_at: rule.created_at,
            updated_at: rule.updated_at,
          }
        }

        return {
          success: true,
          message: 'Router rule retrieved successfully',
          rule: formattedRule,
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

  // Get router rules by target type
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

        // Format rules to match expected response structure
        const formattedRules = rules.map((rule) => {
          try {
            const criteria =
              typeof rule.criteria === 'string'
                ? JSON.parse(rule.criteria)
                : rule.criteria || {}

            return {
              id: rule.id,
              name: rule.name,
              target_type: rule.target_type,
              target_instance_id: rule.target_instance_id,
              root_folder: rule.root_folder || undefined,
              quality_profile:
                rule.quality_profile !== null
                  ? rule.quality_profile
                  : undefined,
              order: rule.order,
              enabled: Boolean(rule.enabled),
              condition: criteria.condition,
              created_at: rule.created_at,
              updated_at: rule.updated_at,
            }
          } catch (parseError) {
            fastify.log.error(
              `Error parsing criteria for rule ID ${rule.id}:`,
              parseError,
            )

            return {
              id: rule.id,
              name: rule.name,
              target_type: rule.target_type,
              target_instance_id: rule.target_instance_id,
              root_folder: rule.root_folder || undefined,
              quality_profile:
                rule.quality_profile !== null
                  ? rule.quality_profile
                  : undefined,
              order: rule.order,
              enabled: Boolean(rule.enabled),
              condition: undefined,
              created_at: rule.created_at,
              updated_at: rule.updated_at,
            }
          }
        })

        return {
          success: true,
          message: `Router rules for target type '${targetType}' retrieved successfully`,
          rules: formattedRules,
        }
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
          order: ruleData.order ?? 50,
          enabled: ruleData.enabled ?? true,
        })

        // Prepare the rule for database insertion, ensuring required fields have values
        const formattedRuleData: Omit<
          RouterRule,
          'id' | 'created_at' | 'updated_at'
        > = {
          name: builtRule.name,
          type: 'conditional',
          criteria: { condition: builtRule.condition },
          target_type: builtRule.target_type,
          target_instance_id: builtRule.target_instance_id,
          root_folder: builtRule.root_folder || null,
          quality_profile: builtRule.quality_profile || null,
          order: builtRule.order || 50,
          enabled: builtRule.enabled !== undefined ? builtRule.enabled : true,
          metadata: null,
        }

        const createdRule = await fastify.db.createRouterRule(formattedRuleData)

        // Format the response to match the expected structure
        let formattedRule: ContentRouterRule
        try {
          const criteria =
            typeof createdRule.criteria === 'string'
              ? JSON.parse(createdRule.criteria)
              : createdRule.criteria || {}

          formattedRule = {
            id: createdRule.id,
            name: createdRule.name,
            target_type: createdRule.target_type,
            target_instance_id: createdRule.target_instance_id,
            root_folder: createdRule.root_folder || undefined,
            quality_profile:
              createdRule.quality_profile !== null
                ? createdRule.quality_profile
                : undefined,
            order: createdRule.order,
            enabled: Boolean(createdRule.enabled),
            condition: criteria.condition,
            created_at: createdRule.created_at,
            updated_at: createdRule.updated_at,
          }
        } catch (parseError) {
          fastify.log.error(
            `Error parsing criteria for newly created rule ID ${createdRule.id}:`,
            parseError,
          )

          formattedRule = {
            id: createdRule.id,
            name: createdRule.name,
            target_type: createdRule.target_type,
            target_instance_id: createdRule.target_instance_id,
            root_folder: createdRule.root_folder || undefined,
            quality_profile:
              createdRule.quality_profile !== null
                ? createdRule.quality_profile
                : undefined,
            order: createdRule.order,
            enabled: Boolean(createdRule.enabled),
            condition: undefined,
            created_at: createdRule.created_at,
            updated_at: createdRule.updated_at,
          }
        }

        reply.status(201)
        return {
          success: true,
          message: 'Router rule created successfully',
          rule: formattedRule,
        }
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

        // Extract existing condition from criteria
        let existingCondition: unknown
        try {
          const existingCriteria =
            typeof existingRule.criteria === 'string'
              ? JSON.parse(existingRule.criteria)
              : existingRule.criteria || {}

          existingCondition = existingCriteria.condition
        } catch (parseError) {
          fastify.log.error(
            `Error parsing criteria for existing rule ID ${id}:`,
            parseError,
          )
          existingCondition = undefined
        }

        // Prepare updates using RuleBuilder to ensure proper structure
        const partialRule = {
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.target_type !== undefined && {
            target_type: updates.target_type,
          }),
          ...(updates.target_instance_id !== undefined && {
            target_instance_id: updates.target_instance_id,
          }),
          ...(updates.root_folder !== undefined && {
            root_folder: updates.root_folder,
          }),
          ...(updates.quality_profile !== undefined && {
            quality_profile:
              typeof updates.quality_profile === 'string'
                ? Number.parseInt(updates.quality_profile, 10)
                : updates.quality_profile,
          }),
          ...(updates.order !== undefined && { order: updates.order }),
          ...(updates.enabled !== undefined && { enabled: updates.enabled }),
          ...(updates.condition !== undefined && {
            condition: updates.condition,
          }),
        }

        // Prepare the updates for the database
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

        // Handle quality profile conversion
        if (updates.quality_profile !== undefined) {
          updatesAsRouterRule.quality_profile =
            typeof updates.quality_profile === 'string'
              ? Number.parseInt(updates.quality_profile, 10)
              : updates.quality_profile || null
        }

        // Use RuleBuilder to handle the condition update
        if (updates.condition) {
          // If modifying an existing condition, use RuleBuilder to ensure proper structure
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

        // Format the response
        let formattedRule: ContentRouterRule
        try {
          const criteria =
            typeof updatedRule.criteria === 'string'
              ? JSON.parse(updatedRule.criteria)
              : updatedRule.criteria || {}

          formattedRule = {
            id: updatedRule.id,
            name: updatedRule.name,
            target_type: updatedRule.target_type,
            target_instance_id: updatedRule.target_instance_id,
            root_folder: updatedRule.root_folder || undefined,
            quality_profile:
              updatedRule.quality_profile !== null
                ? updatedRule.quality_profile
                : undefined,
            order: updatedRule.order,
            enabled: Boolean(updatedRule.enabled),
            condition: criteria.condition,
            created_at: updatedRule.created_at,
            updated_at: updatedRule.updated_at,
          }
        } catch (parseError) {
          fastify.log.error(
            `Error parsing criteria for updated rule ID ${updatedRule.id}:`,
            parseError,
          )

          formattedRule = {
            id: updatedRule.id,
            name: updatedRule.name,
            target_type: updatedRule.target_type,
            target_instance_id: updatedRule.target_instance_id,
            root_folder: updatedRule.root_folder || undefined,
            quality_profile:
              updatedRule.quality_profile !== null
                ? updatedRule.quality_profile
                : undefined,
            order: updatedRule.order,
            enabled: Boolean(updatedRule.enabled),
            condition: undefined,
            created_at: updatedRule.created_at,
            updated_at: updatedRule.updated_at,
          }
        }

        return {
          success: true,
          message: 'Router rule updated successfully',
          rule: formattedRule,
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

        return {
          success: true,
          message: 'Router rule deleted successfully',
        }
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

        return {
          success: true,
          message: `Router rule ${enabled ? 'enabled' : 'disabled'} successfully`,
        }
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
