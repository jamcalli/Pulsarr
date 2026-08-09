import { readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ApprovalData,
  ApprovalRequest,
  ApprovalTrigger,
  RouterDecision,
} from '@root/types/approval.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  Condition,
  ConditionGroup,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingDecision,
  RoutingDetails,
  RoutingEvaluator,
  TargetInstancesResult,
} from '@root/types/router.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import { isArrAlreadyAddedError } from '@utils/arr-error.js'
import { createServiceLogger } from '@utils/logger.js'
import { parseQualityProfileId } from '@utils/quality-profile.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { enrichItemMetadata } from './content-router/enrichment.js'
import { evaluateRules } from './content-router/rule-resolver.js'

/**
 * ContentRouterService is responsible for routing content items to Radarr or Sonarr instances
 * based on configurable rule evaluators. It implements a flexible, pluggable routing system
 * where multiple evaluators can be loaded dynamically.
 *
 * The service loads routing evaluators, applies them to content items, and determines
 * which instances should receive the content based on priority-weighted decisions.
 */
export class ContentRouterService {
  private evaluators: RoutingEvaluator[] = []

  private rulesCache: Awaited<
    ReturnType<FastifyInstance['db']['getAllRouterRules']>
  > | null = null

  private rulesCachePromise: Promise<
    Awaited<ReturnType<FastifyInstance['db']['getAllRouterRules']>>
  > | null = null
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'CONTENT_ROUTER')
  }

  /** Bypass users are always uncapped. */
  private async isWatchlistCapped(
    userId: number,
    contentType: 'movie' | 'show',
    userName?: string,
  ): Promise<boolean> {
    const quota = await this.fastify.db.getUserQuota(userId, contentType)
    if (
      !quota ||
      quota.watchlistCap == null ||
      quota.watchlistCap <= 0 ||
      quota.bypassApproval
    )
      return false

    const count = await this.fastify.db.getWatchlistUsage(userId, contentType)
    const capped = count > quota.watchlistCap

    if (capped) {
      this.fastify.notifications.sendWatchlistCapReached({
        userId,
        userName: userName ?? null,
        contentType,
        currentCount: count,
        cap: quota.watchlistCap,
      })
    }

    return capped
  }

  async initialize(): Promise<void> {
    try {
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const projectRoot = resolve(__dirname, '..')
      const evaluatorsDir = join(projectRoot, 'router-evaluators')

      this.log.debug({ evaluatorsDir }, 'Loading router evaluators')

      const files = await readdir(evaluatorsDir)

      for (const file of files) {
        // Support both .ts (dev mode with Bun) and .js (production build)
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          try {
            // Import each evaluator file dynamically
            const evaluatorPath = join(evaluatorsDir, file)
            const evaluatorModule = await import(`file://${evaluatorPath}`)

            // Each evaluator module should export a factory function that takes fastify as a parameter
            if (typeof evaluatorModule.default === 'function') {
              const evaluator = evaluatorModule.default(this.fastify)

              // Validate the evaluator has all required methods and properties
              if (this.isValidEvaluator(evaluator)) {
                this.evaluators.push(evaluator)
                this.log.debug(
                  { evaluator: evaluator.name },
                  'Loaded router evaluator',
                )
              } else {
                this.log.warn(
                  `Invalid evaluator found: ${file}, missing required methods or properties`,
                )
              }
            }
          } catch (err) {
            this.log.error({ error: err }, `Error loading evaluator ${file}:`)
          }
        }
      }

      // Sort evaluators by priority (highest first) so they execute in priority order
      this.evaluators.sort((a, b) => b.priority - a.priority)

      this.log.info(
        `Successfully loaded ${this.evaluators.length} router evaluators`,
      )
    } catch (error) {
      this.log.error({ error }, 'Error initializing content router')
      throw error
    }
  }

  /**
   * Get all router rules with caching to avoid repeated database queries.
   * Cache is cleared explicitly when rules are modified via API endpoints.
   *
   * @returns Promise resolving to array of router rules
   */
  async getAllRouterRules() {
    if (this.rulesCache) {
      this.log.debug('Using cached router rules')
      return this.rulesCache
    }

    if (this.rulesCachePromise) {
      this.log.debug('Waiting for in-flight router rules fetch')
      return this.rulesCachePromise
    }

    this.log.debug('Fetching router rules from database')
    const fetchPromise = this.fastify.db.getAllRouterRules()
    this.rulesCachePromise = fetchPromise

    try {
      const rules = await fetchPromise
      this.rulesCache = rules
      return rules
    } finally {
      if (this.rulesCachePromise === fetchPromise) {
        this.rulesCachePromise = null
      }
    }
  }

  /**
   * Clear the router rules cache.
   * Should be called whenever rules are created, updated, or deleted via API.
   */
  clearRouterRulesCache(): void {
    this.rulesCache = null
    this.rulesCachePromise = null
    this.log.debug('Router rules cache cleared')
  }

  /**
   * Validates that an evaluator has all the required methods and properties.
   * This type guard ensures we only load properly structured evaluators.
   *
   * @param evaluator - The potential evaluator to validate
   * @returns true if the evaluator is valid, false otherwise
   */
  private isValidEvaluator(evaluator: unknown): evaluator is RoutingEvaluator {
    return (
      evaluator !== null &&
      typeof evaluator === 'object' &&
      'name' in evaluator &&
      'description' in evaluator &&
      'priority' in evaluator &&
      'canEvaluate' in evaluator &&
      typeof (evaluator as RoutingEvaluator).name === 'string' &&
      typeof (evaluator as RoutingEvaluator).description === 'string' &&
      typeof (evaluator as RoutingEvaluator).priority === 'number' &&
      typeof (evaluator as RoutingEvaluator).canEvaluate === 'function'
    )
  }

  /**
   * The main routing method that routes a content item to one or more instances.
   * It applies all applicable evaluators, collects their routing decisions,
   * and processes them in priority order.
   *
   * Several routing strategies are supported:
   * 1. Forced routing to a specific instance
   * 2. Evaluator-based routing where rules determine destination instances
   * 3. Sync-target routing when syncing operations are in progress
   * 4. Default instance fallback routing when no specific rules match
   *
   * @param item - The content item to route
   * @param key - Unique identifier for the watchlist item
   * @param options - Additional routing options like userIds, sync info, etc.
   * @returns Promise resolving to the list of instance IDs the item was routed to
   */
  async routeContent(
    item: ContentItem,
    key: string,
    options: {
      userId: number
      userName?: string
      syncing?: boolean
      syncTargetInstanceId?: number
    },
  ): Promise<{
    routedInstances: number[]
    routingDetails: RoutingDetails[]
  }> {
    const contentType = item.type
    const routedInstances: number[] = []

    this.log.info(
      {
        title: item.title,
        contentType,
        syncing: options.syncing,
        userId: options.userId,
        userName: options.userName,
      },
      `Routing ${contentType} "${item.title}"${options.syncing ? ' during sync operation' : ''}`,
    )

    let allRouterRules: Awaited<ReturnType<typeof this.getAllRouterRules>> = []
    try {
      // Fetch all router rules (uses cache if available)
      allRouterRules = await this.getAllRouterRules()
    } catch (error) {
      this.log.error(
        { error },
        `Error checking for router rules for "${item.title}"`,
      )
      // Continue with default routing path on error
    }

    // Check if any enabled rules exist to avoid unnecessary enrichment
    const hasAnyRules = allRouterRules.some((rule) => rule.enabled)

    // For sync operations: check if any rules specifically TARGET the sync target instance
    // This determines if the sync target is governed by router rules or just uses syncedInstances config
    const targetType = contentType === 'movie' ? 'radarr' : 'sonarr'
    const hasRulesTargetingSyncInstance =
      options.syncing && options.syncTargetInstanceId !== undefined
        ? allRouterRules.some(
            (rule) =>
              rule.enabled &&
              rule.target_type === targetType &&
              rule.target_instance_id === options.syncTargetInstanceId,
          )
        : false

    // Sync with no rules at all: nothing to resolve - route straight to the
    // sync target (sync bypasses the gates entirely)
    if (
      !hasAnyRules &&
      options.syncing &&
      options.syncTargetInstanceId !== undefined
    ) {
      this.log.debug(
        `No routing rules exist during sync, using sync target instance ${options.syncTargetInstanceId} for "${item.title}"`,
      )

      try {
        if (contentType === 'movie') {
          await this.fastify.radarrManager.routeItemToRadarr(
            item as RadarrItem,
            key,
            options.userId,
            options.syncTargetInstanceId,
            options.syncing,
          )
        } else {
          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            options.userId,
            options.syncTargetInstanceId,
            options.syncing,
          )
        }
        routedInstances.push(options.syncTargetInstanceId)
      } catch (error) {
        this.log.error(
          { error },
          `Error routing "${item.title}" to sync target instance ${options.syncTargetInstanceId}`,
        )
        throw error
      }
      return { routedInstances, routingDetails: [] }
    }

    // Prepare context for evaluators with all the information they need
    const context: RoutingContext = {
      userId: options.userId,
      userName: options.userName,
      itemKey: key,
      contentType,
      syncing: options.syncing,
      syncTargetInstanceId: options.syncTargetInstanceId,
    }

    let enrichedItem = item
    if (hasAnyRules) {
      try {
        enrichedItem = await enrichItemMetadata(
          this.fastify,
          this.log,
          allRouterRules,
          item,
          context,
        )
      } catch (error) {
        this.log.error(
          { error },
          `Failed to enrich metadata for "${item.title}"`,
        )
        // Continue with original item if enrichment fails
      }
    }

    // RESOLVE: rules -> decisions. Exclude rules are evaluated first inside
    // the resolver - a match is an absolute veto and must be distinguishable
    // from "no rule matched at all" so it never falls through to the
    // default-instance path below.
    const allDecisions: RoutingDecision[] = []

    if (hasAnyRules) {
      const resolution = evaluateRules(
        this.log,
        allRouterRules,
        enrichedItem,
        context,
        (condition, evalItem, evalContext) =>
          this.evaluateCondition(condition, evalItem, evalContext),
      )

      if (resolution.skipReason === 'excluded') {
        return { routedInstances: [], routingDetails: [] }
      }

      allDecisions.push(...resolution.decisions)
      // Highest priority first - the order both the gate and execution use
      allDecisions.sort((a, b) => (b.priority || 50) - (a.priority || 50))
    }

    // Sync operations bypass the gates - internal data movement, not a new
    // content addition
    if (options.syncing && options.syncTargetInstanceId !== undefined) {
      return await this.routeSyncTarget(
        item,
        key,
        options.userId,
        options.syncTargetInstanceId,
        allDecisions,
        hasRulesTargetingSyncInstance,
      )
    }

    // DEFAULT PATH: no rule matched - gate against the would-be default
    // decisions, then execute via default routing
    if (allDecisions.length === 0) {
      this.log.info(
        hasAnyRules
          ? `No matching routing rules for "${item.title}", using default routing`
          : `No routing rules exist, using default routing for "${item.title}"`,
      )

      const defaultRoutingDecisions =
        await this.getDefaultRoutingDecisions(contentType)

      // The default tail is true sync expansion ([default, ...synced]), so it
      // belongs in the approval record's syncedInstances
      const gateOutcome = await this.applyPreRoutingGates(
        enrichedItem,
        context,
        defaultRoutingDecisions,
        defaultRoutingDecisions.slice(1).map((d) => d.instanceId),
      )
      if (gateOutcome.action === 'handled') {
        return gateOutcome.result
      }
      if (gateOutcome.action === 'blocked') {
        return { routedInstances: [], routingDetails: [] }
      }

      const defaultRoutedInstances = await this.routeUsingDefault(
        item,
        key,
        contentType,
        options.userId,
        options.syncing,
        /* recordQuota */ false, // Quota already consumed in the gate
      )

      let defaultActualRouting: RoutingDetails | undefined
      if (defaultRoutedInstances.length > 0) {
        defaultActualRouting = await this.getActualRoutingFromInstance(
          defaultRoutedInstances[0],
          contentType,
        )

        await this.createAutoApprovalRecord(
          item,
          context,
          defaultRoutedInstances,
          [],
          defaultActualRouting,
          defaultRoutedInstances.slice(1),
        )
      }

      return {
        routedInstances: defaultRoutedInstances,
        routingDetails: defaultActualRouting ? [defaultActualRouting] : [],
      }
    }

    // RULE PATH: gate once against the matched decisions, then execute each.
    // Rule-matched tails are independent rule targets, never sync expansion,
    // so no syncedInstances are proposed
    const gateOutcome = await this.applyPreRoutingGates(
      enrichedItem,
      context,
      allDecisions,
      undefined,
    )
    if (gateOutcome.action === 'handled') {
      return gateOutcome.result
    }
    if (gateOutcome.action === 'blocked') {
      return { routedInstances: [], routingDetails: [] }
    }

    // EXECUTE: route each decision in priority order
    let routeCount = 0
    const allActualRoutings: RoutingDetails[] = []
    const processedInstanceIds = new Set<number>()

    for (const decision of allDecisions) {
      // Only the highest priority decision per instance is routed
      if (processedInstanceIds.has(decision.instanceId)) {
        this.log.debug(
          `Skipping duplicate routing to instance ${decision.instanceId} for "${item.title}"`,
        )
        continue
      }

      // Mark this instance as processed to prevent lower priority rules for same instance
      processedInstanceIds.add(decision.instanceId)

      // Build log message with optional rule name
      const ruleInfo = decision.ruleName
        ? ` via rule "${decision.ruleName}"`
        : ''

      this.log.info(
        {
          title: item.title,
          instanceId: decision.instanceId,
          ruleId: decision.ruleId,
          ruleName: decision.ruleName,
          priority: decision.priority || 50,
        },
        `Routing "${item.title}" to instance ID ${decision.instanceId}${ruleInfo}`,
      )

      try {
        // Route to the appropriate instance based on content type
        if (contentType === 'movie') {
          // Convert rootFolder from string|null|undefined to string|undefined
          const rootFolder =
            decision.rootFolder === null ? undefined : decision.rootFolder

          await this.fastify.radarrManager.routeItemToRadarr(
            item as RadarrItem,
            key,
            options.userId,
            decision.instanceId,
            options.syncing,
            rootFolder,
            decision.qualityProfile,
            decision.tags,
            decision.searchOnAdd,
            decision.minimumAvailability,
            decision.monitor,
          )

          // Capture the ACTUAL routing parameters that were sent
          const radarrInstance = await this.fastify.db.getRadarrInstance(
            decision.instanceId,
          )
          if (radarrInstance) {
            // Resolve values using the same logic as RadarrManagerService
            const targetRootFolder =
              rootFolder || radarrInstance.rootFolder || undefined
            const qpSource =
              decision.qualityProfile ?? radarrInstance.qualityProfile
            const targetQualityProfileId =
              qpSource == null ? undefined : parseQualityProfileId(qpSource)
            const targetTags = [
              ...new Set(decision.tags ?? radarrInstance.tags ?? []),
            ]
            const targetSearchOnAdd =
              decision.searchOnAdd ?? radarrInstance.searchOnAdd ?? true
            const targetMinimumAvailability =
              decision.minimumAvailability ??
              radarrInstance.minimumAvailability ??
              'released'
            const targetMonitor =
              decision.monitor ?? radarrInstance.monitor ?? 'movieOnly'

            allActualRoutings.push({
              instanceId: decision.instanceId,
              instanceType: 'radarr',
              qualityProfile: targetQualityProfileId?.toString(),
              rootFolder: targetRootFolder,
              tags: targetTags,
              searchOnAdd: targetSearchOnAdd,
              minimumAvailability: targetMinimumAvailability,
              monitor: targetMonitor,
              ruleId: decision.ruleId,
              ruleName: decision.ruleName,
            })
          }
        } else {
          // Convert rootFolder from string|null|undefined to string|undefined
          const rootFolder =
            decision.rootFolder === null ? undefined : decision.rootFolder

          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            options.userId,
            decision.instanceId,
            options.syncing,
            rootFolder,
            decision.qualityProfile,
            decision.tags,
            decision.searchOnAdd,
            decision.seasonMonitoring,
            decision.seriesType,
          )

          // Capture the ACTUAL routing parameters that were sent
          const sonarrInstance = await this.fastify.db.getSonarrInstance(
            decision.instanceId,
          )
          if (sonarrInstance) {
            // Resolve values using the same logic as SonarrManagerService
            const targetRootFolder =
              rootFolder || sonarrInstance.rootFolder || undefined
            const qpSource =
              decision.qualityProfile ?? sonarrInstance.qualityProfile
            const targetQualityProfileId =
              qpSource == null ? undefined : parseQualityProfileId(qpSource)
            const targetTags = [
              ...new Set(decision.tags ?? sonarrInstance.tags ?? []),
            ]
            const targetSearchOnAdd =
              decision.searchOnAdd ?? sonarrInstance.searchOnAdd ?? true
            const targetSeasonMonitoring =
              decision.seasonMonitoring ??
              sonarrInstance.seasonMonitoring ??
              'all'
            const targetSeriesType =
              decision.seriesType ?? sonarrInstance.seriesType ?? 'standard'

            allActualRoutings.push({
              instanceId: decision.instanceId,
              instanceType: 'sonarr',
              qualityProfile: targetQualityProfileId?.toString(),
              rootFolder: targetRootFolder,
              tags: targetTags,
              searchOnAdd: targetSearchOnAdd,
              seasonMonitoring: targetSeasonMonitoring,
              seriesType: targetSeriesType,
              ruleId: decision.ruleId,
              ruleName: decision.ruleName,
            })
          }
        }
        routeCount++
        routedInstances.push(decision.instanceId)
      } catch (routeError) {
        this.log.error(
          { error: routeError },
          `Error routing "${item.title}" to instance ${decision.instanceId}`,
        )
      }
    }

    this.log.info(
      `Successfully routed "${item.title}" to ${routeCount} instances`,
    )

    // Create auto-approval record for tracking all successful content additions
    if (routedInstances.length > 0) {
      // Rule-matched routing has no sync expansion - the tail is independent
      // rule decisions, not sync targets.
      await this.createAutoApprovalRecord(
        enrichedItem,
        context,
        routedInstances,
        allDecisions,
        allActualRoutings[0],
        undefined,
      )
    }

    return { routedInstances, routingDetails: allActualRoutings }
  }

  /**
   * Applies the pre-routing gates in order: existing approval request,
   * watchlist cap, approval requirements, then atomic quota consumption.
   * Sync operations pass straight through - sync is internal data movement.
   *
   * `syncedInstances` names the instances the primary decision mirrors into
   * on approval. Only default routing passes a tail here - a rule-matched
   * tail is independent rule targets and must NOT be proposed as sync
   * expansion, or approving the request would fan out to them.
   */
  private async applyPreRoutingGates(
    item: ContentItem,
    context: RoutingContext,
    decisions: RoutingDecision[],
    syncedInstances: number[] | undefined,
  ): Promise<
    | {
        action: 'handled'
        result: { routedInstances: number[]; routingDetails: RoutingDetails[] }
      }
    | { action: 'blocked' }
    | { action: 'proceed' }
  > {
    if (context.syncing) {
      return { action: 'proceed' }
    }

    try {
      const contentKey = context.itemKey || item.guids[0] || ''

      const existingResult = await this.checkExistingApprovalRequest(
        context.userId,
        contentKey,
        item,
        context,
      )
      if (existingResult) {
        return { action: 'handled', result: existingResult }
      }

      // Watchlist cap - hard block before approval creation
      if (context.userId > 0) {
        if (
          await this.isWatchlistCapped(
            context.userId,
            context.contentType,
            context.userName,
          )
        ) {
          this.log.info(
            `Watchlist cap reached for "${item.title}" by user ${context.userName || context.userId} — skipping`,
          )
          return { action: 'blocked' }
        }
      }

      // With no decisions there is nothing to propose for approval and
      // nothing will be routed, so quota must not be consumed either
      if (decisions.length === 0) {
        return { action: 'proceed' }
      }

      const approvalResult = await this.checkApprovalRequirements(
        item,
        context,
        decisions,
      )

      if (approvalResult.required) {
        this.log.info(
          `Approval required for "${item.title}" by user ${context.userName || context.userId}: ${approvalResult.reason}`,
        )

        await this.fastify.approvalService.createApprovalRequest(
          {
            id: context.userId,
            name: context.userName || `User ${context.userId}`,
          },
          item,
          {
            action: 'require_approval',
            approval: {
              reason: approvalResult.reason || 'Approval required',
              triggeredBy: approvalResult.trigger || 'manual_flag',
              data: approvalResult.data || {},
              proposedRouting: await this.createProposedRoutingDecision(
                decisions[0],
                context.contentType,
                syncedInstances,
              ),
            },
          },
          approvalResult.trigger || 'manual_flag',
          approvalResult.reason,
          undefined,
          context.itemKey,
        )

        return { action: 'blocked' }
      }

      // Atomic quota consumption (check + record in a single transaction,
      // preventing concurrent items from all passing the check first)
      if (context.userId > 0) {
        const quotasBypassedByRule =
          approvalResult.data?.quotasBypassedByRule ?? false

        if (quotasBypassedByRule) {
          this.log.debug(
            `Skipping quota consumption for "${item.title}" - router rule bypasses quotas`,
          )
          return { action: 'proceed' }
        }

        const quotaResult = await this.fastify.quotaService.tryConsumeQuota(
          context.userId,
          context.contentType,
        )

        if (quotaResult.hasQuota && !quotaResult.consumed) {
          const wouldBeUsage = quotaResult.currentUsage + 1

          this.log.info(
            `Quota exceeded for "${item.title}" by user ${context.userName || context.userId}: ${quotaResult.quotaType} (${wouldBeUsage}/${quotaResult.quotaLimit})`,
          )

          if (quotaResult.userBypassEnabled) {
            this.log.info(
              `User ${context.userId} has quota bypass enabled, auto-approving quota-exceeded item "${item.title}"`,
            )
            return { action: 'proceed' }
          }

          const approvalReasonText = `${quotaResult.quotaType} quota exceeded (${wouldBeUsage}/${quotaResult.quotaLimit})`

          await this.fastify.approvalService.createApprovalRequest(
            {
              id: context.userId,
              name: context.userName || `User ${context.userId}`,
            },
            item,
            {
              action: 'require_approval',
              approval: {
                reason: approvalReasonText,
                triggeredBy: 'quota_exceeded',
                data: {
                  quotaType: quotaResult.quotaType as
                    | 'daily'
                    | 'weekly_rolling'
                    | 'monthly',
                  quotaUsage: wouldBeUsage,
                  quotaLimit: quotaResult.quotaLimit,
                },
                proposedRouting: await this.createProposedRoutingDecision(
                  decisions[0],
                  context.contentType,
                  syncedInstances,
                ),
              },
            },
            'quota_exceeded',
            approvalReasonText,
            undefined,
            context.itemKey,
          )

          this.log.info(
            `Created approval request for quota-exceeded item "${item.title}"`,
          )

          return { action: 'blocked' }
        }

        if (quotaResult.consumed) {
          this.log.debug(
            `Quota consumed for user ${context.userId}: ${quotaResult.currentUsage}/${quotaResult.quotaLimit} for ${context.contentType}`,
          )
        }
      }

      return { action: 'proceed' }
    } catch (error) {
      this.log.error(
        { error },
        `Error applying pre-routing gates for "${item.title}"`,
      )
      // Fail open - routing proceeds rather than silently dropping content
      return { action: 'proceed' }
    }
  }

  /**
   * Handles sync operations targeting a specific instance when router rules
   * exist. Sync bypasses the gates entirely and never creates approval
   * records - it is internal data movement, not a new content addition.
   */
  private async routeSyncTarget(
    item: ContentItem,
    key: string,
    userId: number,
    syncTargetInstanceId: number,
    allDecisions: RoutingDecision[],
    hasRulesTargetingSyncInstance: boolean,
  ): Promise<{
    routedInstances: number[]
    routingDetails: RoutingDetails[]
  }> {
    const contentType = item.type
    const routedInstances: number[] = []

    const syncTargetDecision = allDecisions.find(
      (d) => d.instanceId === syncTargetInstanceId,
    )

    // A rule targets the sync instance and matched - route with its settings
    if (syncTargetDecision) {
      this.log.info(
        `Sync: Router rules allow "${item.title}" to instance ${syncTargetInstanceId}`,
      )

      try {
        const rootFolder =
          syncTargetDecision.rootFolder === null
            ? undefined
            : syncTargetDecision.rootFolder

        if (contentType === 'movie') {
          await this.fastify.radarrManager.routeItemToRadarr(
            item as RadarrItem,
            key,
            userId,
            syncTargetInstanceId,
            true,
            rootFolder,
            syncTargetDecision.qualityProfile,
            syncTargetDecision.tags,
            syncTargetDecision.searchOnAdd,
            syncTargetDecision.minimumAvailability,
            syncTargetDecision.monitor,
          )
        } else {
          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            userId,
            syncTargetInstanceId,
            true,
            rootFolder,
            syncTargetDecision.qualityProfile,
            syncTargetDecision.tags,
            syncTargetDecision.searchOnAdd,
            syncTargetDecision.seasonMonitoring,
            syncTargetDecision.seriesType,
          )
        }
        routedInstances.push(syncTargetInstanceId)
      } catch (error) {
        this.log.error(
          { error },
          `Error syncing "${item.title}" to instance ${syncTargetInstanceId}`,
        )
      }

      return { routedInstances, routingDetails: [] }
    }

    // Rules matched but route elsewhere - sync must not copy the content in
    if (allDecisions.length > 0) {
      this.log.info(
        `Sync blocked: Router rules route "${item.title}" to other instances (${allDecisions.map((d) => d.instanceId).join(', ')}), not to sync target ${syncTargetInstanceId}`,
      )
      return { routedInstances: [], routingDetails: [] }
    }

    // Rules target the sync instance but none matched - sync is prevented
    if (hasRulesTargetingSyncInstance) {
      this.log.info(
        `No routing decisions for "${item.title}" during sync - router rules targeting instance ${syncTargetInstanceId} exist but didn't match. Sync prevented by router rules.`,
      )
      return { routedInstances: [], routingDetails: [] }
    }

    // No rules govern the sync target - it relies on syncedInstances config
    this.log.info(
      `No router rules target instance ${syncTargetInstanceId} for ${contentType}, proceeding with sync for "${item.title}"`,
    )

    try {
      if (contentType === 'movie') {
        await this.fastify.radarrManager.routeItemToRadarr(
          item as RadarrItem,
          key,
          userId,
          syncTargetInstanceId,
          true,
        )
      } else {
        await this.fastify.sonarrManager.routeItemToSonarr(
          item as SonarrItem,
          key,
          userId,
          syncTargetInstanceId,
          true,
        )
      }
      routedInstances.push(syncTargetInstanceId)
    } catch (error) {
      this.log.error(
        { error },
        `Error routing "${item.title}" to sync target instance ${syncTargetInstanceId}`,
      )
    }

    return { routedInstances, routingDetails: [] }
  }

  /**
   * Checks for existing approval requests and handles them based on status.
   * Returns null if processing should continue, or a routing result if processing should stop.
   */
  private async checkExistingApprovalRequest(
    userId: number,
    contentKey: string,
    item: ContentItem,
    context: RoutingContext,
  ): Promise<{
    routedInstances: number[]
    routingDetails: RoutingDetails[]
  } | null> {
    const existingRequest = await this.fastify.db.getApprovalRequestByContent(
      userId,
      contentKey,
    )

    if (!existingRequest) {
      return null // No existing request, continue processing
    }

    switch (existingRequest.status) {
      case 'pending':
        this.log.info(
          `Pending approval request already exists for "${item.title}" by user ${context.userName || context.userId}`,
        )
        return { routedInstances: [], routingDetails: [] }

      case 'approved':
      case 'auto_approved':
        this.log.info(
          `Using previously approved routing for "${item.title}" by user ${context.userName || context.userId}`,
        )
        return await this.routeUsingApprovedDecision(
          existingRequest,
          item,
          context,
        )

      case 'rejected':
        this.log.info(
          `Content "${item.title}" was previously rejected for user ${context.userName || context.userId}, skipping routing`,
        )
        return { routedInstances: [], routingDetails: [] }

      case 'expired':
        // Allow reprocessing of expired requests
        this.log.info(
          `Previous approval request for "${item.title}" by user ${context.userName || context.userId} has expired, allowing reprocessing`,
        )
        return null // Continue processing

      default:
        this.log.info(
          `Existing approval request found with status "${existingRequest.status}" for "${item.title}" by user ${context.userName || context.userId}, skipping routing`,
        )
        return { routedInstances: [], routingDetails: [] }
    }
  }

  /**
   * Evaluates a condition against a content item.
   * Handles negation by inverting the result if the condition has a negate flag.
   * This method serves as the public interface for condition evaluation.
   *
   * @param condition - The condition or condition group to evaluate
   * @param item - The content item to evaluate against
   * @param context - Routing context for additional information
   * @returns boolean indicating whether the condition is satisfied
   */
  evaluateCondition(
    condition: Condition | ConditionGroup,
    item: ContentItem,
    context: RoutingContext,
  ): boolean {
    // Handle negation wrapper by inverting the result if condition.negate is true
    const result = this._evaluateCondition(condition, item, context)
    return condition.negate ? !result : result
  }

  /**
   * Internal implementation of condition evaluation.
   * Distinguishes between single conditions and condition groups,
   * delegating evaluation to appropriate methods.
   *
   * @param condition - The condition or condition group to evaluate
   * @param item - The content item to evaluate against
   * @param context - Routing context for additional information
   * @returns boolean indicating whether the condition is satisfied
   */
  private _evaluateCondition(
    condition: Condition | ConditionGroup,
    item: ContentItem,
    context: RoutingContext,
  ): boolean {
    // Handle group condition (contains nested conditions with AND/OR operator)
    if ('conditions' in condition) {
      return this.evaluateGroupCondition(condition, item, context)
    }

    // For single conditions, find an evaluator that can handle this field
    const { field } = condition as Condition

    // First try to find an evaluator that explicitly handles this field
    for (const evaluator of this.evaluators) {
      if (
        evaluator.evaluateCondition &&
        evaluator.canEvaluateConditionField?.(field)
      ) {
        try {
          const result = evaluator.evaluateCondition(condition, item, context)
          return result
        } catch (error) {
          this.log.error(
            {
              error,
              evaluator: evaluator.name,
              field: condition.field,
              itemGuids: item.guids,
            },
            'Evaluator condition evaluation failed (field-specific path)',
          )
          // Continue to next evaluator instead of failing routing
        }
      }
    }

    // No evaluator claims this field - most likely a typo'd field name in a
    // saved rule, which would otherwise stop matching with no trace in the logs
    this.log.warn(
      { field },
      `No evaluator can handle condition field "${field}" - condition evaluates to false`,
    )
    return false
  }

  /**
   * Evaluates a group of conditions connected by a logical operator (AND/OR).
   * For AND, all conditions must be true; for OR, at least one must be true.
   *
   * @param group - The condition group to evaluate
   * @param item - The content item to evaluate against
   * @param context - Routing context for additional information
   * @returns boolean indicating whether the condition group is satisfied
   */
  private evaluateGroupCondition(
    group: ConditionGroup,
    item: ContentItem,
    context: RoutingContext,
  ): boolean {
    // Empty condition group is always false
    if (!group.conditions || group.conditions.length === 0) {
      return false
    }

    // For AND operator, all conditions must be true
    if (group.operator === 'AND') {
      // Short-circuit by returning false as soon as any condition is false
      for (const condition of group.conditions) {
        if (!this.evaluateCondition(condition, item, context)) {
          return false
        }
      }
      // If we reached here, all conditions were true
      return true
    }

    // For OR operator, at least one condition must be true
    // Short-circuit by returning true as soon as any condition is true
    for (const condition of group.conditions) {
      if (this.evaluateCondition(condition, item, context)) {
        return true
      }
    }
    // If we reached here, no conditions were true
    return false
  }

  /**
   * Generic routing method that handles both movie and show routing to multiple instances.
   * Fetches appropriate instances, maps them by ID, and routes the item using the correct manager.
   *
   * @param contentType - Type of content ('movie' or 'show')
   * @param item - The content item to route
   * @param key - Unique identifier for the watchlist item
   * @param userId - ID of the user who owns the watchlist item
   * @param instanceIds - Array of instance IDs to route to
   * @param syncing - Whether this is part of a sync operation
   * @returns Promise resolving to array of instance IDs the item was successfully routed to
   */
  private async routeToInstances(
    contentType: 'movie' | 'show',
    item: ContentItem,
    key: string,
    userId: number,
    instanceIds: number[],
    syncing?: boolean,
  ): Promise<number[]> {
    const routedInstances: number[] = []

    if (contentType === 'movie') {
      const allInstances = await this.fastify.db.getAllRadarrInstances()
      const instanceMap = new Map(
        allInstances.map((instance) => [instance.id, instance]),
      )

      for (const instanceId of instanceIds) {
        const instance = instanceMap.get(instanceId)
        if (!instance) {
          this.log.warn(`Radarr instance ${instanceId} not found – skipping`)
          continue
        }

        try {
          // Get the root folder for this instance (handling null case)
          const rootFolder =
            instance.rootFolder === null ? undefined : instance.rootFolder

          // Route to the instance with its specific settings
          await this.fastify.radarrManager.routeItemToRadarr(
            item as RadarrItem,
            key,
            userId,
            instanceId,
            syncing,
            rootFolder,
            instance.qualityProfile,
            instance.tags,
            instance.searchOnAdd,
            instance.minimumAvailability,
            instance.monitor,
          )
          routedInstances.push(instanceId)
        } catch (error) {
          this.log.error(
            { error },
            `Error routing "${item.title}" to Radarr instance ${instanceId}`,
          )
          // Continue with other instances even if one fails
        }
      }
    } else {
      const allInstances = await this.fastify.db.getAllSonarrInstances()
      const instanceMap = new Map(
        allInstances.map((instance) => [instance.id, instance]),
      )

      for (const instanceId of instanceIds) {
        const instance = instanceMap.get(instanceId)
        if (!instance) {
          this.log.warn(`Sonarr instance ${instanceId} not found – skipping`)
          continue
        }

        try {
          const rootFolder =
            instance.rootFolder === null ? undefined : instance.rootFolder

          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            userId,
            instanceId,
            syncing,
            rootFolder,
            instance.qualityProfile,
            instance.tags,
            instance.searchOnAdd,
            instance.seasonMonitoring,
            instance.seriesType,
          )
          routedInstances.push(instanceId)
        } catch (error) {
          this.log.error(
            { error },
            `Error routing "${item.title}" to Sonarr instance ${instanceId}`,
          )
          // Continue with other instances even if one fails
        }
      }
    }

    return routedInstances
  }

  /**
   * Default routing method used when no evaluator rules match.
   * Routes content to the default instance for its type (Radarr/Sonarr),
   * and also to any instances that are configured as "synced instances" for the default.
   *
   * This provides a fallback routing strategy that ensures content still reaches
   * appropriate instances even when no specific rules apply.
   *
   * @param item - The content item to route
   * @param key - Unique identifier for the watchlist item
   * @param contentType - Type of content ('movie' or 'show')
   * @param userId - ID of the user who owns the watchlist item
   * @param syncing - Whether this is part of a sync operation
   * @returns Promise resolving to array of instance IDs the item was routed to
   */
  private async routeUsingDefault(
    item: ContentItem,
    key: string,
    contentType: 'movie' | 'show',
    userId: number,
    syncing?: boolean,
    recordQuota: boolean = true,
  ): Promise<number[]> {
    try {
      // Get all instances that should be routed to (using shared logic)
      const { instanceIds } = await this.getDefaultInstanceIds(contentType)
      if (instanceIds.length === 0) {
        return []
      }

      // Use the generic routing method
      const routedInstances = await this.routeToInstances(
        contentType,
        item,
        key,
        userId,
        instanceIds,
        syncing,
      )

      // Record quota usage if enabled and routing was successful
      // Only count once per content item regardless of how many instances it was routed to
      if (recordQuota && userId > 0 && !syncing && routedInstances.length > 0) {
        const recorded = await this.fastify.quotaService.recordUsage(
          userId,
          contentType,
        )
        if (recorded) {
          this.log.info(
            `Recorded quota usage for user ${userId}: ${item.title}`,
          )
        }
      }

      return routedInstances
    } catch (error) {
      this.log.error({ error }, `Error in default routing for ${item.title}`)
      return []
    }
  }

  /**
   * Returns information about all loaded evaluators.
   * This is primarily used for API responses and logging.
   *
   * @returns Array of evaluator metadata (name, description, priority)
   */
  getLoadedEvaluators(): Array<{
    name: string
    description: string
    priority: number
  }> {
    return this.evaluators.map((e) => ({
      name: e.name,
      description: e.description,
      priority: e.priority,
    }))
  }

  /**
   * Returns detailed metadata about all loaded evaluators, including their supported
   * fields and operators. This information is valuable for UIs that need to present
   * rule creation options dynamically based on available evaluators.
   *
   * @returns Array of detailed evaluator metadata
   */
  getEvaluatorsMetadata(): Array<{
    name: string
    description: string
    priority: number
    supportedFields?: FieldInfo[]
    supportedOperators?: Record<string, OperatorInfo[]>
    contentType?: 'radarr' | 'sonarr' | 'both'
  }> {
    return this.evaluators.map((evaluator) => ({
      name: evaluator.name,
      description: evaluator.description,
      priority: evaluator.priority,
      supportedFields: evaluator.supportedFields || [],
      supportedOperators: evaluator.supportedOperators || {},
      contentType: evaluator.contentType || 'both',
    }))
  }

  /**
   * Checks if routing decisions require approval based on router rules and user quotas.
   * This method evaluates approval criteria like user-based rules ("if user = 'User A' then require approval")
   * and quota restrictions to determine if content should be held for admin review.
   *
   * @param item - The content item being routed
   * @param context - The routing context with user information
   * @param routingDecisions - The routing decisions that would be applied
   * @returns Promise resolving to approval requirement result
   */
  private async checkApprovalRequirements(
    item: ContentItem,
    context: RoutingContext,
    _routingDecisions: RoutingDecision[],
  ): Promise<{
    required: boolean
    reason?: string
    trigger?: ApprovalTrigger
    data?: ApprovalData
  }> {
    // Sync operations never require approval - they're internal data movement
    if (context.syncing) {
      return { required: false }
    }

    if (!context.userId) {
      return { required: false }
    }

    try {
      // Get user information for later checks
      const user = await this.fastify.db.getUser(context.userId)
      if (!user) {
        return { required: false }
      }

      // PRIORITY 1: Router Rules (absolute content policy - always checked first)
      const allRouterRules = await this.getAllRouterRules()
      const expectedTargetType =
        context.contentType === 'movie' ? 'radarr' : 'sonarr'
      let quotasBypassedByRule = false

      for (const rule of allRouterRules) {
        if (!rule.enabled) continue
        if (rule.target_type !== expectedTargetType) continue
        // Exclude rules never route content, so approval semantics don't
        // apply - they're vetoed upstream in routeContent() before approval
        // checks would even run for genuinely excluded content.
        if (rule.exclude_from_routing) continue

        // Check if this rule matches the current context
        if (rule.criteria && typeof rule.criteria === 'object') {
          if (!rule.criteria.condition) {
            this.log.error(
              `Router rule ${rule.id} ("${rule.name}") has no condition in criteria - skipping`,
            )
            continue
          }
          try {
            const condition = rule.criteria.condition
            const matches = this.evaluateCondition(condition, item, context)

            if (matches) {
              // Use only the highest weight matching rule for all decisions
              if (rule.bypass_user_quotas) {
                quotasBypassedByRule = true
              }

              // Router rule decision trumps everything else - use highest weight matching rule
              if (rule.always_require_approval) {
                return {
                  required: true,
                  reason:
                    rule.approval_reason ||
                    `Approval required by router rule: ${rule.name}`,
                  trigger: 'router_rule',
                  data: {
                    ruleId: rule.id,
                    criteriaType: 'router_rule',
                    criteriaValue: rule.name,
                    // Include bypass flag so processApprovedRequest can skip quota recording
                    quotasBypassedByRule,
                  },
                }
              } else {
                // Highest weight rule doesn't require approval - bypass router rule approval
                this.log.debug(
                  {
                    scope: 'checkApprovalRequirements',
                    ruleName: rule.name,
                    ruleWeight: rule.order, // aka "weight" in docs/PR
                    ruleId: rule.id,
                    itemTitle: item.title,
                  },
                  'Router rule bypassing approval for item',
                )
                // Highest-weight match handled; skip remaining router rules
                break
              }
            }
          } catch (error) {
            this.log.error({ error }, `Error evaluating router rule ${rule.id}`)
          }
        }
      }

      // PRIORITY 2: User requires_approval (user-level restriction)
      if (user.requires_approval === true) {
        return {
          required: true,
          reason: `User "${user.name}" requires approval for all content`,
          trigger: 'manual_flag',
          data: {
            criteriaType: 'user_requires_approval',
            criteriaValue: user.name,
          },
        }
      }

      // NOTE: Quota checking is handled AFTER this method returns
      // via tryConsumeQuota() for atomic check+consume behavior.
      // We pass the bypass flag here so caller can use it.
      return {
        required: false,
        data: { quotasBypassedByRule },
      }
    } catch (error) {
      this.log.error({ error }, 'Error checking approval requirements')
      return { required: false }
    }
  }

  /**
   * Parses synced instances from various input formats
   */
  private parseSyncedInstances(
    syncedInstances: number[] | string | null | undefined,
  ): number[] {
    if (Array.isArray(syncedInstances)) {
      return syncedInstances
    }
    if (typeof syncedInstances === 'string') {
      try {
        return JSON.parse(syncedInstances || '[]')
      } catch (e) {
        this.log.error(
          { error: e },
          `Invalid syncedInstances JSON: "${syncedInstances}"`,
        )
        return []
      }
    }
    return []
  }

  /**
   * Validates and filters synced instance IDs against available instances
   */
  private validateSyncedInstances<T extends { id: number }>(
    syncedIds: number[],
    allInstances: T[],
    existingIds: number[],
  ): number[] {
    const instanceMap = new Map(
      allInstances.map((instance) => [instance.id, instance]),
    )
    const validIds: number[] = []

    for (const rawId of syncedIds) {
      const syncedId = Number(rawId)
      if (Number.isNaN(syncedId)) {
        this.log.warn(`Invalid synced instance ID "${rawId}" – skipping`)
        continue
      }

      // Skip if we've already included this instance
      if (existingIds.includes(syncedId)) continue

      // Check if the instance exists
      const instance = instanceMap.get(syncedId)
      if (!instance) {
        this.log.warn(`Synced instance ${syncedId} not found – skipping`)
        continue
      }

      validIds.push(syncedId)
    }

    return validIds
  }

  /**
   * Gets all instances that would be used for default routing (default + synced
   * instances) without executing the routing. Shared by actual routing and
   * approval checking to ensure identical behavior.
   */
  private async getDefaultInstanceIds(
    contentType: 'movie' | 'show',
  ): Promise<TargetInstancesResult> {
    try {
      const instanceIds: number[] = []

      if (contentType === 'movie') {
        const defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
        if (!defaultInstance) {
          this.log.warn('No default Radarr instance found')
          return { instanceIds: [] }
        }

        if (defaultInstance.skipDefaultRoutingWhenNoMatch) {
          this.log.debug(
            `Default routing disabled on default Radarr instance "${defaultInstance.name}" — skipping movie with no matching router rule`,
          )
          return { instanceIds: [], skipReason: 'default-skip' }
        }

        instanceIds.push(defaultInstance.id)
        const syncedIds = this.parseSyncedInstances(
          defaultInstance.syncedInstances,
        )

        if (syncedIds.length > 0) {
          const allInstances = await this.fastify.db.getAllRadarrInstances()
          const validSyncedIds = this.validateSyncedInstances(
            syncedIds,
            allInstances,
            instanceIds,
          )
          instanceIds.push(...validSyncedIds)
        }
      } else {
        const defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
        if (!defaultInstance) {
          this.log.warn('No default Sonarr instance found')
          return { instanceIds: [] }
        }

        if (defaultInstance.skipDefaultRoutingWhenNoMatch) {
          this.log.debug(
            `Default routing disabled on default Sonarr instance "${defaultInstance.name}" — skipping show with no matching router rule`,
          )
          return { instanceIds: [], skipReason: 'default-skip' }
        }

        instanceIds.push(defaultInstance.id)
        const syncedIds = this.parseSyncedInstances(
          defaultInstance.syncedInstances,
        )

        if (syncedIds.length > 0) {
          const allInstances = await this.fastify.db.getAllSonarrInstances()
          const validSyncedIds = this.validateSyncedInstances(
            syncedIds,
            allInstances,
            instanceIds,
          )
          instanceIds.push(...validSyncedIds)
        }
      }

      return { instanceIds }
    } catch (error) {
      this.log.error(
        { error },
        `Error getting default ${contentType} instances`,
      )
      return { instanceIds: [] }
    }
  }

  /**
   * Gets all default routing decisions that would be made for the given content type
   * without actually executing the routing. This includes the default instance plus
   * any synced instances that would be automatically routed to.
   *
   * @param contentType - Type of content ('movie' or 'show')
   * @returns Promise resolving to array of routing decisions (empty if no default instance)
   */
  private async getDefaultRoutingDecisions(
    contentType: 'movie' | 'show',
  ): Promise<RoutingDecision[]> {
    try {
      const { instanceIds } = await this.getDefaultInstanceIds(contentType)
      if (instanceIds.length === 0) {
        return []
      }

      const decisions: RoutingDecision[] = []

      if (contentType === 'movie') {
        const allInstances = await this.fastify.db.getAllRadarrInstances()
        const instanceMap = new Map(
          allInstances.map((instance) => [instance.id, instance]),
        )

        for (const instanceId of instanceIds) {
          const instance = instanceMap.get(instanceId)
          if (instance) {
            // Resolve actual routing values (same logic as actual routing)
            const resolvedQualityProfile = parseQualityProfileId(
              instance.qualityProfile,
            )
            const resolvedRootFolder = instance.rootFolder || undefined
            const resolvedTags = instance.tags || []
            const resolvedSearchOnAdd = instance.searchOnAdd ?? true
            const resolvedMinimumAvailability =
              instance.minimumAvailability || 'released'
            const resolvedMonitor = instance.monitor || 'movieOnly'

            decisions.push({
              instanceId: instance.id,
              qualityProfile: resolvedQualityProfile?.toString() || null,
              rootFolder: resolvedRootFolder || null,
              tags: resolvedTags,
              priority: 50, // Default priority
              searchOnAdd: resolvedSearchOnAdd,
              minimumAvailability: resolvedMinimumAvailability,
              monitor: resolvedMonitor,
            })
          }
        }
      } else {
        const allInstances = await this.fastify.db.getAllSonarrInstances()
        const instanceMap = new Map(
          allInstances.map((instance) => [instance.id, instance]),
        )

        for (const instanceId of instanceIds) {
          const instance = instanceMap.get(instanceId)
          if (instance) {
            // Resolve actual routing values (same logic as actual routing)
            const resolvedQualityProfile = parseQualityProfileId(
              instance.qualityProfile,
            )
            const resolvedRootFolder = instance.rootFolder || undefined
            const resolvedTags = instance.tags || []
            const resolvedSearchOnAdd = instance.searchOnAdd ?? true
            const resolvedSeasonMonitoring = instance.seasonMonitoring || 'all'
            const resolvedSeriesType = instance.seriesType || 'standard'

            decisions.push({
              instanceId: instance.id,
              qualityProfile: resolvedQualityProfile?.toString() || null,
              rootFolder: resolvedRootFolder || null,
              tags: resolvedTags,
              priority: 50, // Default priority
              searchOnAdd: resolvedSearchOnAdd,
              seasonMonitoring: resolvedSeasonMonitoring,
              seriesType: resolvedSeriesType,
            })
          }
        }
      }

      return decisions
    } catch (error) {
      this.log.error(
        { error },
        `Error getting default routing decisions for ${contentType}`,
      )
      return []
    }
  }

  /**
   * Builds the proposedRouting field for an approval record. Only pass
   * syncedInstances when the tail is true sync expansion from default,
   * not independent rule decisions.
   */
  private async createProposedRoutingDecision(
    primaryDecision: RoutingDecision | undefined,
    contentType: 'movie' | 'show',
    syncedInstances?: number[],
  ): Promise<NonNullable<RouterDecision['approval']>['proposedRouting']> {
    if (!primaryDecision) {
      return undefined
    }

    return {
      instanceId: primaryDecision.instanceId,
      instanceType: contentType === 'movie' ? 'radarr' : 'sonarr',
      qualityProfile: primaryDecision.qualityProfile,
      rootFolder: primaryDecision.rootFolder,
      tags: primaryDecision.tags,
      priority: primaryDecision.priority,
      searchOnAdd: primaryDecision.searchOnAdd,
      seasonMonitoring: primaryDecision.seasonMonitoring,
      seriesType: primaryDecision.seriesType,
      minimumAvailability: primaryDecision.minimumAvailability,
      monitor: primaryDecision.monitor,
      syncedInstances:
        syncedInstances && syncedInstances.length > 0
          ? syncedInstances
          : undefined,
    }
  }

  /**
   * Creates an auto-approval record for tracking content that was automatically added
   * without going through the normal approval process. This ensures all content additions
   * are tracked in the approval system for audit and UI purposes.
   */
  private async createAutoApprovalRecord(
    item: ContentItem,
    context: RoutingContext,
    routedInstances: number[],
    routingDecisions: RoutingDecision[],
    actualRouting?: RoutingDetails,
    syncedInstances?: number[],
  ): Promise<void> {
    try {
      // Skip if this is a sync operation
      if (context.syncing) {
        this.log.debug(
          `Skipping auto-approval record for sync operation: ${item.title}`,
        )
        return
      }

      // Check if there's already an approval request for this content to avoid duplicates
      const lookupUserId = context.userId ?? 0
      const contentKey =
        context.itemKey ||
        item.guids[0] ||
        `${context.contentType}:${(item.title || 'unknown').slice(0, 128)}`
      const existingRequest = await this.fastify.db.getApprovalRequestByContent(
        lookupUserId,
        contentKey,
      )
      if (existingRequest) {
        this.log.debug(
          `Auto-approval record already exists for ${item.title}, skipping`,
        )
        return
      }

      // Use provided user or system user (0) for RSS/immediate processing
      const userId = context.userId || 0

      // Use actual routing that was executed, not proposed routing
      let proposedRouting: RouterDecision['routing'] | undefined
      const normalizedSyncedInstances =
        syncedInstances && syncedInstances.length > 0
          ? syncedInstances
          : undefined

      if (actualRouting) {
        // Use the ACTUAL routing parameters that were sent to Radarr/Sonarr
        proposedRouting = {
          instanceId: actualRouting.instanceId,
          instanceType: actualRouting.instanceType,
          qualityProfile: actualRouting.qualityProfile,
          rootFolder: actualRouting.rootFolder,
          tags: actualRouting.tags,
          priority: 50, // Default priority
          searchOnAdd: actualRouting.searchOnAdd,
          seasonMonitoring: actualRouting.seasonMonitoring,
          seriesType: actualRouting.seriesType as
            | 'standard'
            | 'anime'
            | 'daily'
            | null
            | undefined,
          minimumAvailability: actualRouting.minimumAvailability as
            | 'announced'
            | 'inCinemas'
            | 'released'
            | undefined,
          monitor: actualRouting.monitor as
            | 'movieOnly'
            | 'movieAndCollection'
            | 'none'
            | undefined,
          syncedInstances: normalizedSyncedInstances,
        }
      } else if (routingDecisions.length > 0) {
        // Fall back to proposed routing from decisions if no actual routing captured
        const primaryDecision = routingDecisions[0]

        proposedRouting = {
          instanceId: primaryDecision.instanceId,
          instanceType: context.contentType === 'movie' ? 'radarr' : 'sonarr',
          qualityProfile: primaryDecision.qualityProfile,
          rootFolder: primaryDecision.rootFolder,
          tags: primaryDecision.tags,
          priority: primaryDecision.priority,
          searchOnAdd: primaryDecision.searchOnAdd,
          seasonMonitoring: primaryDecision.seasonMonitoring,
          seriesType: primaryDecision.seriesType,
          minimumAvailability: primaryDecision.minimumAvailability,
          monitor: primaryDecision.monitor,
          syncedInstances: normalizedSyncedInstances,
        }
      } else {
        // Default routing case - use instance information from routed instances
        const primaryInstanceId = routedInstances[0]

        proposedRouting = {
          instanceId: primaryInstanceId,
          instanceType: context.contentType === 'movie' ? 'radarr' : 'sonarr',
          qualityProfile: null,
          rootFolder: null,
          tags: [],
          priority: 50,
          searchOnAdd: null,
          syncedInstances: normalizedSyncedInstances,
        }
      }

      // Create a direct auto-approval tracking record (bypass approval workflow)
      // This creates the record with 'pending' status initially, then we'll update it
      // Use the same structure as regular approval requests for UI compatibility
      const approvalRequest = await this.fastify.db.createApprovalRequest({
        userId,
        contentType: context.contentType as 'movie' | 'show',
        contentTitle: item.title,
        contentKey,
        contentGuids: item.guids,
        routerDecision: {
          action: 'require_approval',
          approval: {
            data: {},
            reason: 'Auto-added (no approval required)',
            triggeredBy: 'content_criteria',
            proposedRouting: proposedRouting,
          },
        },
        triggeredBy: 'content_criteria',
        approvalReason: 'Auto-added (no approval required)',
      })

      // Update to auto_approved status without going through approval service
      const updatedRequest = await this.fastify.db.updateApprovalRequest(
        approvalRequest.id,
        {
          status: 'auto_approved',
          approvedBy: undefined, // No admin approval for auto-approved items
          approvalNotes: 'Auto-approved (no approval required)',
        },
      )

      this.log.info(
        `Created auto-approval tracking record for "${item.title}" (request ID: ${approvalRequest.id})`,
      )

      // Emit SSE event for auto-approval creation
      if (this.fastify.progress?.hasActiveConnections() && updatedRequest) {
        const finalUserName =
          updatedRequest.userName ||
          (userId === 0 ? 'System' : `User ${userId}`)

        const metadata = {
          action: 'created' as const,
          requestId: updatedRequest.id,
          userId: updatedRequest.userId,
          userName: finalUserName,
          contentTitle: updatedRequest.contentTitle,
          contentType: updatedRequest.contentType,
          status: updatedRequest.status,
        }

        this.fastify.progress.emit({
          operationId: `approval-${updatedRequest.id}`,
          type: 'approval',
          phase: 'created',
          progress: 100,
          message: `Auto-approved "${updatedRequest.contentTitle}" for ${finalUserName}`,
          metadata,
        })
      }

      // Send native webhook notification for auto-approval (fire-and-forget)
      if (updatedRequest && proposedRouting) {
        void this.fastify.notifications.sendApprovalAuto(
          updatedRequest,
          {
            instanceType: proposedRouting.instanceType,
            instanceId: proposedRouting.instanceId,
            qualityProfile: proposedRouting.qualityProfile ?? null,
            rootFolder: proposedRouting.rootFolder ?? null,
            tags: proposedRouting.tags ?? [],
            searchOnAdd: proposedRouting.searchOnAdd ?? null,
            minimumAvailability: proposedRouting.minimumAvailability ?? null,
            monitor: proposedRouting.monitor ?? null,
            seasonMonitoring: proposedRouting.seasonMonitoring ?? null,
            seriesType: proposedRouting.seriesType ?? null,
            syncedInstances: proposedRouting.syncedInstances,
          },
          'Auto-approved (no approval required)',
        )
      }
    } catch (error) {
      // Log error but don't fail the routing operation
      this.log.error(
        { error },
        `Failed to create auto-approval record for "${item.title}"`,
      )
    }
  }

  /**
   * Routes content using a previously approved decision
   */
  private async routeUsingApprovedDecision(
    approvedRequest: ApprovalRequest,
    item: ContentItem,
    context: RoutingContext,
  ): Promise<{
    routedInstances: number[]
    routingDetails: RoutingDetails[]
  }> {
    try {
      const proposedRouting =
        approvedRequest.proposedRouterDecision?.approval?.proposedRouting

      if (!proposedRouting?.instanceId) {
        this.log.error(
          { approvedRequest },
          'Approved request has invalid routing decision',
        )
        return { routedInstances: [], routingDetails: [] }
      }

      const routedInstances: number[] = []
      const instanceId = proposedRouting.instanceId
      const syncedInstanceIds = proposedRouting.syncedInstances ?? []
      const contentType = approvedRequest.contentType
      const userId = approvedRequest.userId ?? 0

      if (contentType === 'movie') {
        try {
          await this.fastify.radarrManager.routeItemToRadarr(
            item as RadarrItem,
            context.itemKey,
            userId,
            instanceId,
            context.syncing,
            proposedRouting.rootFolder || undefined,
            proposedRouting.qualityProfile,
            proposedRouting.tags || [],
            proposedRouting.searchOnAdd,
            proposedRouting.minimumAvailability,
            proposedRouting.monitor,
          )
          routedInstances.push(instanceId)
          this.log.info(
            `Successfully routed approved content "${item.title}" to Radarr instance ${instanceId}`,
          )
        } catch (error) {
          if (isArrAlreadyAddedError(error)) {
            this.log.info(
              `Approved content "${item.title}" already exists in Radarr instance ${instanceId}, treating as routed`,
            )
            routedInstances.push(instanceId)
          } else {
            this.log.error(
              { error },
              `Failed to route approved content "${item.title}" to Radarr instance ${instanceId}`,
            )
          }
        }

        for (const syncedId of syncedInstanceIds) {
          try {
            await this.fastify.radarrManager.routeItemToRadarr(
              item as RadarrItem,
              context.itemKey,
              userId,
              syncedId,
              true,
            )
            routedInstances.push(syncedId)
            this.log.info(
              `Successfully routed approved content "${item.title}" to synced Radarr instance ${syncedId}`,
            )
          } catch (error) {
            if (isArrAlreadyAddedError(error)) {
              this.log.info(
                `Approved content "${item.title}" already exists in synced Radarr instance ${syncedId}, treating as routed`,
              )
              routedInstances.push(syncedId)
            } else {
              this.log.error(
                { error },
                `Failed to route approved content "${item.title}" to synced Radarr instance ${syncedId}`,
              )
            }
          }
        }
      } else {
        try {
          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            context.itemKey,
            userId,
            instanceId,
            context.syncing,
            proposedRouting.rootFolder || undefined,
            proposedRouting.qualityProfile,
            proposedRouting.tags || [],
            proposedRouting.searchOnAdd,
            proposedRouting.seasonMonitoring,
            proposedRouting.seriesType,
          )
          routedInstances.push(instanceId)
          this.log.info(
            `Successfully routed approved content "${item.title}" to Sonarr instance ${instanceId}`,
          )
        } catch (error) {
          if (isArrAlreadyAddedError(error)) {
            this.log.info(
              `Approved content "${item.title}" already exists in Sonarr instance ${instanceId}, treating as routed`,
            )
            routedInstances.push(instanceId)
          } else {
            this.log.error(
              { error },
              `Failed to route approved content "${item.title}" to Sonarr instance ${instanceId}`,
            )
          }
        }

        for (const syncedId of syncedInstanceIds) {
          try {
            await this.fastify.sonarrManager.routeItemToSonarr(
              item as SonarrItem,
              context.itemKey,
              userId,
              syncedId,
              true,
            )
            routedInstances.push(syncedId)
            this.log.info(
              `Successfully routed approved content "${item.title}" to synced Sonarr instance ${syncedId}`,
            )
          } catch (error) {
            if (isArrAlreadyAddedError(error)) {
              this.log.info(
                `Approved content "${item.title}" already exists in synced Sonarr instance ${syncedId}, treating as routed`,
              )
              routedInstances.push(syncedId)
            } else {
              this.log.error(
                { error },
                `Failed to route approved content "${item.title}" to synced Sonarr instance ${syncedId}`,
              )
            }
          }
        }
      }

      // Build routing details from the approved routing
      const routingDetails = [
        {
          instanceId: proposedRouting.instanceId,
          instanceType: (approvedRequest.contentType === 'movie'
            ? 'radarr'
            : 'sonarr') as 'radarr' | 'sonarr',
          qualityProfile: proposedRouting.qualityProfile,
          rootFolder: proposedRouting.rootFolder,
          tags: proposedRouting.tags,
          searchOnAdd: proposedRouting.searchOnAdd,
          minimumAvailability: proposedRouting.minimumAvailability,
          monitor: proposedRouting.monitor,
          seasonMonitoring: proposedRouting.seasonMonitoring,
          seriesType: proposedRouting.seriesType,
          ruleId: approvedRequest.routerRuleId ?? undefined,
          ruleName: undefined, // Rule name not stored in approval request
        },
      ]

      return { routedInstances, routingDetails }
    } catch (error) {
      this.log.error({ error }, 'Error routing using approved decision')
      return { routedInstances: [], routingDetails: [] }
    }
  }

  /**
   * Gets the actual routing configuration from an instance for auto-approval records.
   * This ensures default routing captures the same information as rule-based routing.
   */
  private async getActualRoutingFromInstance(
    instanceId: number,
    contentType: 'movie' | 'show',
  ): Promise<RoutingDetails | undefined> {
    try {
      if (contentType === 'movie') {
        const radarrInstance =
          await this.fastify.db.getRadarrInstance(instanceId)
        if (radarrInstance) {
          return {
            instanceId: radarrInstance.id,
            instanceType: 'radarr',
            qualityProfile: radarrInstance.qualityProfile,
            rootFolder: radarrInstance.rootFolder,
            tags: radarrInstance.tags || [],
            searchOnAdd: radarrInstance.searchOnAdd,
            minimumAvailability: radarrInstance.minimumAvailability,
            monitor: radarrInstance.monitor,
          }
        }
      } else {
        const sonarrInstance =
          await this.fastify.db.getSonarrInstance(instanceId)
        if (sonarrInstance) {
          return {
            instanceId: sonarrInstance.id,
            instanceType: 'sonarr',
            qualityProfile: sonarrInstance.qualityProfile,
            rootFolder: sonarrInstance.rootFolder,
            tags: sonarrInstance.tags || [],
            searchOnAdd: sonarrInstance.searchOnAdd,
            seasonMonitoring: sonarrInstance.seasonMonitoring,
            seriesType: sonarrInstance.seriesType,
          }
        }
      }
      return undefined
    } catch (error) {
      this.log.error(
        { error },
        `Error getting instance configuration for auto-approval record`,
      )
      return undefined
    }
  }

  /**
   * Determines which instance(s) would be targeted for a given content item based on routing rules.
   * This is a "dry-run" method that evaluates routing decisions without actually performing the route.
   * Used by sync operations to perform routing-aware existence checks.
   *
   * @param item - The content item to evaluate
   * @param context - Routing context with user information and content type
   * @returns Promise resolving to target instance IDs, with a skipReason when
   *   an empty list is deliberate (skip toggle or exclude rule)
   */
  async getTargetInstances(
    item: ContentItem,
    context: RoutingContext,
  ): Promise<TargetInstancesResult> {
    const contentType = context.contentType

    try {
      // Get all router rules and evaluate them for this content
      const allRouterRules = await this.getAllRouterRules()
      const hasAnyRules = allRouterRules.some((rule) => rule.enabled)

      let itemForEvaluation = item
      if (hasAnyRules) {
        try {
          itemForEvaluation = await enrichItemMetadata(
            this.fastify,
            this.log,
            allRouterRules,
            item,
            context,
          )
          this.log.debug(
            `Item "${item.title}" enriched for routing target evaluation`,
          )
        } catch (error) {
          this.log.error(
            { error },
            `Failed to enrich metadata for "${item.title}" during target evaluation, using original item`,
          )
          // Continue with original item if enrichment fails
        }
      }

      const resolution = evaluateRules(
        this.log,
        allRouterRules,
        itemForEvaluation,
        context,
        (condition, evalItem, evalContext) =>
          this.evaluateCondition(condition, evalItem, evalContext),
      )

      if (resolution.skipReason === 'excluded') {
        return { instanceIds: [], skipReason: 'excluded' }
      }

      // If routing rules matched, return those target instances (deduped -
      // multiple rules may target the same instance)
      if (resolution.decisions.length > 0) {
        return {
          instanceIds: [
            ...new Set(resolution.decisions.map((d) => d.instanceId)),
          ],
        }
      }

      // No routing rules matched - check if we should use sync target
      if (context.syncing && context.syncTargetInstanceId !== undefined) {
        return { instanceIds: [context.syncTargetInstanceId] }
      }

      // No routing rules matched, fall back to default instance(s)
      return await this.getDefaultInstanceIds(contentType)
    } catch (error) {
      this.log.error(
        { error },
        `Error determining target instances for ${item.title}`,
      )
      // On error, check if we should use sync target before falling back to defaults
      if (context.syncing && context.syncTargetInstanceId !== undefined) {
        return { instanceIds: [context.syncTargetInstanceId] }
      }

      return await this.getDefaultInstanceIds(contentType)
    }
  }
}
