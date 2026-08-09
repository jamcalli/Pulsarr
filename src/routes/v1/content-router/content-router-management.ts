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
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'
import type { ContentRouterRuleUpdate } from '@schemas/content-router/content-router.schema.js'

/**
 * Maps a validated rule payload to its stored shape. PUT is a full replace,
 * so every clearable column gets an explicit value - updateRouterRule skips
 * undefined fields, which would otherwise leave stale values behind.
 */
function normalizeRulePayload(
  ruleData: ContentRouterRuleUpdate,
): Omit<RouterRule, 'id' | 'created_at' | 'updated_at' | 'metadata'> {
  const excludeFromRouting = ruleData.exclude_from_routing ?? false

  return {
    name: ruleData.name,
    type: 'conditional',
    criteria: {
      condition: ruleData.condition || {
        operator: 'AND',
        conditions: [],
        negate: false,
      },
    },
    target_type: ruleData.target_type,
    // Exclude rules never route, so instance-scoped fields are cleared
    target_instance_id: excludeFromRouting ? null : ruleData.target_instance_id,
    root_folder: excludeFromRouting ? null : ruleData.root_folder || null,
    quality_profile: excludeFromRouting
      ? null
      : (ruleData.quality_profile ?? null),
    tags: excludeFromRouting ? [] : ruleData.tags || [],
    order: ruleData.order ?? 50,
    enabled: ruleData.enabled ?? true,
    search_on_add: ruleData.search_on_add ?? null,
    season_monitoring: ruleData.season_monitoring ?? null,
    series_type: ruleData.series_type ?? null,
    monitor: ruleData.monitor ?? null,
    always_require_approval: ruleData.always_require_approval ?? false,
    bypass_user_quotas: ruleData.bypass_user_quotas ?? false,
    approval_reason: ruleData.approval_reason ?? null,
    exclude_from_routing: excludeFromRouting,
  }
}

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get all router rules
  fastify.get(
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

        const formattedRules = rules.map((rule) =>
          formatRule(rule, fastify.log),
        )

        return {
          success: true,
          message: 'Router rules retrieved successfully',
          rules: formattedRules,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve router rules',
        })
        return reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  // Get router rules by type
  fastify.get(
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
          enabledOnly: z
            .string()
            .transform((v) => v === 'true')
            .pipe(z.boolean())
            .optional()
            .default(true),
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

        const formattedRules = rules.map((rule) =>
          formatRule(rule, fastify.log),
        )

        return {
          success: true,
          message: `Router rules of type '${type}' retrieved successfully`,
          rules: formattedRules,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve router rules by type',
          type: request.params.type,
        })
        return reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  // Get router rules by target
  fastify.get(
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

        const formattedRules = rules.map((rule) =>
          formatRule(rule, fastify.log),
        )

        return {
          success: true,
          message: `Router rules for ${targetType} instance ${instanceId} retrieved successfully`,
          rules: formattedRules,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve router rules by target',
          targetType: request.query.targetType,
          instanceId: request.query.instanceId,
        })
        return reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  // Get router rule by ID
  fastify.get(
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

        const formattedRule = formatRule(rule, fastify.log)

        return {
          success: true,
          message: 'Router rule retrieved successfully',
          rule: formattedRule,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve router rule by ID',
          ruleId: request.params.id,
        })
        return reply.internalServerError('Unable to retrieve router rule')
      }
    },
  )

  // Get router rules by target type
  fastify.get(
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

        const formattedRules = rules.map((rule) =>
          formatRule(rule, fastify.log),
        )

        return {
          success: true,
          message: `Router rules for target type '${targetType}' retrieved successfully`,
          rules: formattedRules,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve router rules by target type',
          targetType: request.params.targetType,
        })
        return reply.internalServerError('Unable to retrieve router rules')
      }
    },
  )

  // Create a router rule
  fastify.post(
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
        const createdRule = await fastify.db.createRouterRule({
          ...normalizeRulePayload(request.body),
          metadata: null,
        })

        fastify.contentRouter.clearRouterRulesCache()

        const formattedRule = formatRule(createdRule, fastify.log)

        reply.status(201)
        return {
          success: true,
          message: 'Router rule created successfully',
          rule: formattedRule,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to create router rule',
          ruleName: request.body.name,
        })
        return reply.internalServerError('Unable to create router rule')
      }
    },
  )

  // Update a router rule
  fastify.put(
    '/rules/:id',
    {
      schema: {
        summary: 'Update router rule',
        operationId: 'updateRouterRule',
        description:
          'Replace an existing content router rule by its ID. The full rule payload is required - fields left out are cleared, not preserved.',
        params: z.object({
          id: z.coerce.number(),
        }),
        body: ContentRouterRuleUpdateSchema,
        response: {
          200: ContentRouterRuleResponseSchema,
          400: ContentRouterRuleErrorSchema,
          404: ContentRouterRuleErrorSchema,
          500: ContentRouterRuleErrorSchema,
        },
        tags: ['Content Router'],
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        const existingRule = await fastify.db.getRouterRuleById(id)
        if (!existingRule) {
          return reply.notFound(`Router rule with ID ${id} not found`)
        }

        const updated = await fastify.db.updateRouterRule(
          id,
          normalizeRulePayload(request.body),
        )

        if (!updated) {
          return reply.internalServerError(
            `Failed to update router rule with ID ${id}`,
          )
        }

        const updatedRule = await fastify.db.getRouterRuleById(id)

        if (!updatedRule) {
          return reply.internalServerError(
            `Failed to retrieve updated router rule with ID ${id}`,
          )
        }

        fastify.contentRouter.clearRouterRulesCache()

        const formattedRule = formatRule(updatedRule, fastify.log)

        return {
          success: true,
          message: 'Router rule updated successfully',
          rule: formattedRule,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update router rule',
          ruleId: request.params.id,
        })
        return reply.internalServerError('Unable to update router rule')
      }
    },
  )

  // Delete a router rule
  fastify.delete(
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

        const existingRule = await fastify.db.getRouterRuleById(id)
        if (!existingRule) {
          return reply.notFound(`Router rule with ID ${id} not found`)
        }

        const deleted = await fastify.db.deleteRouterRule(id)

        if (!deleted) {
          return reply.internalServerError(
            `Failed to delete router rule with ID ${id}`,
          )
        }

        fastify.contentRouter.clearRouterRulesCache()

        return {
          success: true,
          message: 'Router rule deleted successfully',
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to delete router rule',
          ruleId: request.params.id,
        })
        return reply.internalServerError('Unable to delete router rule')
      }
    },
  )

  // Toggle a router rule
  fastify.patch(
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

        const existingRule = await fastify.db.getRouterRuleById(id)
        if (!existingRule) {
          return reply.notFound(`Router rule with ID ${id} not found`)
        }

        const updated = await fastify.db.toggleRouterRule(id, enabled)

        if (!updated) {
          return reply.internalServerError(
            `Failed to toggle router rule with ID ${id}`,
          )
        }

        fastify.contentRouter.clearRouterRulesCache()

        return {
          success: true,
          message: `Router rule ${enabled ? 'enabled' : 'disabled'} successfully`,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
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
