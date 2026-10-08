import type { EvaluatorMetadata } from '@root/schemas/content-router/evaluator-metadata.schema.js'
import {
  evaluatorMetadata,
  ROUTER_EVALUATORS,
} from '@root/schemas/content-router/router-fields.js'
import type {
  Condition,
  ConditionGroup,
  ContentItem,
  RouterRule,
  RoutingContext,
  TargetInstancesResult,
} from '@root/types/router.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { evaluateCondition } from './content-router/conditions.js'
import { routeContent } from './content-router/route-content.js'
import { RuleCache } from './content-router/rule-cache.js'
import { getTargetInstances } from './content-router/target-instances.js'
import type {
  ContentRouterDeps,
  RouteContentOptions,
  RoutingOutcome,
} from './content-router/types.js'

export class ContentRouterService {
  private readonly log: FastifyBaseLogger
  private readonly rules: RuleCache

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'CONTENT_ROUTER')
    this.rules = new RuleCache(
      () => this.fastify.db.getAllRouterRules(),
      this.log,
    )
  }

  // config is a getter because updateConfig reassigns fastify.config and deps outlive a single call
  private get deps(): ContentRouterDeps {
    const { fastify } = this
    return {
      logger: this.log,
      get config() {
        return fastify.config
      },
      db: fastify.db,
      fastify,
      rules: this.rules,
      radarrManager: fastify.radarrManager,
      sonarrManager: fastify.sonarrManager,
      approvalService: fastify.approvalService,
      quotaService: fastify.quotaService,
      notifications: fastify.notifications,
      progress: fastify.progress,
    }
  }

  getAllRouterRules(): Promise<RouterRule[]> {
    return this.rules.get()
  }

  clearRouterRulesCache(): void {
    this.rules.clear()
  }

  routeContent(
    item: ContentItem,
    key: string,
    options: RouteContentOptions,
  ): Promise<RoutingOutcome> {
    return routeContent(item, key, options, this.deps)
  }

  getTargetInstances(
    item: ContentItem,
    context: RoutingContext,
  ): Promise<TargetInstancesResult> {
    return getTargetInstances(item, context, this.deps)
  }

  evaluateCondition(
    condition: Condition | ConditionGroup,
    item: ContentItem,
    context: RoutingContext,
  ): boolean {
    return evaluateCondition(condition, item, context, this.log)
  }

  getLoadedEvaluators(): Array<{
    name: string
    description: string
    priority: number
  }> {
    return ROUTER_EVALUATORS.map(({ name, description, priority }) => ({
      name,
      description,
      priority,
    }))
  }

  getEvaluatorsMetadata(): EvaluatorMetadata[] {
    return evaluatorMetadata()
  }
}
