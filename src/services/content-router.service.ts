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
import type {
  ContentRouterRuleOrder,
  ContentRouterRuleUpdate,
} from '@schemas/content-router/content-router.schema.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { LRUCache } from 'lru-cache'
import { evaluateCondition } from './content-router/conditions.js'
import { routeContent } from './content-router/route-content.js'
import {
  createRule,
  deleteRule,
  type RuleWriteDeps,
  reorderRules,
  toggleRule,
  updateRule,
} from './content-router/rule-writes.js'
import { getTargetInstances } from './content-router/target-instances.js'
import type {
  ContentRouterDeps,
  RouteContentOptions,
  RoutingOutcome,
} from './content-router/types.js'
import {
  createUserListCache,
  type UserListCache,
} from './content-router/user-list-cache.js'

const RULES_KEY = 'rules'

export class ContentRouterService {
  readonly log: FastifyBaseLogger
  private readonly rules: LRUCache<typeof RULES_KEY, RouterRule[]>
  private readonly userLists: UserListCache

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'CONTENT_ROUTER')
    this.rules = fastify.caches.create({
      max: 1,
      // A clear mid-fetch still answers its waiting callers but never stores the rules it read
      ignoreFetchAbort: true,
      fetchMethod: () => this.fastify.db.getAllRouterRules(),
    })
    this.userLists = createUserListCache(fastify.caches)
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
      rules: { get: () => this.getAllRouterRules() },
      userLists: this.userLists,
      radarrManager: fastify.radarrManager,
      sonarrManager: fastify.sonarrManager,
      approvalService: fastify.approvalService,
      quotaService: fastify.quotaService,
      notifications: fastify.notifications,
      progress: fastify.progress,
    }
  }

  /** Rejects when the read fails, and a failed read is never cached. */
  getAllRouterRules(): Promise<RouterRule[]> {
    return this.rules.forceFetch(RULES_KEY)
  }

  clearRouterRulesCache(): void {
    this.rules.clear()
  }

  /** Drops the user's cached Plex lists, so list rules read them again. */
  clearUserLists(userId: number): void {
    this.userLists.delete(userId)
  }

  private get ruleWriteDeps(): RuleWriteDeps {
    return {
      db: this.fastify.db,
      httpErrors: this.fastify.httpErrors,
      clearRules: () => this.clearRouterRulesCache(),
    }
  }

  /** Throws 400 for an unknown season monitoring value or a missing target instance. */
  createRouterRule(ruleData: ContentRouterRuleUpdate): Promise<RouterRule> {
    return createRule(ruleData, this.ruleWriteDeps)
  }

  /** Throws 404 for an unknown rule and 400 for a rejected value or a missing target instance. */
  updateRouterRule(
    id: number,
    ruleData: ContentRouterRuleUpdate,
  ): Promise<RouterRule> {
    return updateRule(id, ruleData, this.ruleWriteDeps)
  }

  /** Throws 404 for an unknown rule. */
  deleteRouterRule(id: number): Promise<void> {
    return deleteRule(id, this.ruleWriteDeps)
  }

  /** Throws 404 for an unknown rule. */
  toggleRouterRule(id: number, enabled: boolean): Promise<void> {
    return toggleRule(id, enabled, this.ruleWriteDeps)
  }

  /** Throws 404 when any id is unknown, and resolves to every rule after the reorder. */
  reorderRouterRules(
    orders: ContentRouterRuleOrder['orders'],
  ): Promise<RouterRule[]> {
    return reorderRules(orders, this.ruleWriteDeps)
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
