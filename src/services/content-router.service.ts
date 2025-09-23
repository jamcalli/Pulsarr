import { readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RouterDecision } from '@root/types/approval.types.js'
import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'
import type {
  RadarrInstance,
  Item as RadarrItem,
} from '@root/types/radarr.types.js'
import type {
  Condition,
  ConditionGroup,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import type { SonarrInstance, SonarrItem } from '@root/types/sonarr.types.js'
import {
  extractImdbId,
  extractTmdbId,
  extractTvdbId,
} from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

/**
 * ContentRouterService is responsible for routing content items to Radarr or Sonarr instances
 * based on configurable rule evaluators. It implements a flexible, pluggable routing system
 * where multiple evaluators can be loaded dynamically.
 *
 * The service loads routing evaluators, applies them to content items, and determines
 * which instances should receive the content based on priority-weighted decisions.
 */
export class ContentRouterService {
  /**
   * Collection of loaded routing evaluators that will be applied to content
   */
  private evaluators: RoutingEvaluator[] = []
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'CONTENT_ROUTER')
  }

  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  /**
   * Initialize the router service by loading all evaluators from the router-evaluators directory.
   * Each evaluator is loaded, validated, and stored for later use. Evaluators are sorted by
   * priority so higher priority evaluators are executed first.
   */
  async initialize(): Promise<void> {
    try {
      // Dynamically load all evaluators from the evaluators directory
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const projectRoot = resolve(__dirname, '..')
      const evaluatorsDir = join(projectRoot, 'router-evaluators')

      this.log.debug({ evaluatorsDir }, 'Loading router evaluators')

      const files = await readdir(evaluatorsDir)

      for (const file of files) {
        if (file.endsWith('.js')) {
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
      'evaluate' in evaluator &&
      typeof (evaluator as RoutingEvaluator).name === 'string' &&
      typeof (evaluator as RoutingEvaluator).description === 'string' &&
      typeof (evaluator as RoutingEvaluator).priority === 'number' &&
      typeof (evaluator as RoutingEvaluator).canEvaluate === 'function' &&
      typeof (evaluator as RoutingEvaluator).evaluate === 'function'
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
      userId?: number
      userName?: string
      syncing?: boolean
      syncTargetInstanceId?: number
      forcedInstanceId?: number
    } = {},
  ): Promise<{ routedInstances: number[] }> {
    const contentType = item.type
    const routedInstances: number[] = []

    // Step 1: Handle forced routing if specified
    // Skip forced routing during sync operations with target instance to respect routing rules
    if (
      options.forcedInstanceId !== undefined &&
      !(options.syncing && options.syncTargetInstanceId !== undefined)
    ) {
      this.log.info(
        `Forced routing of "${item.title}" to instance ID ${options.forcedInstanceId}`,
      )

      try {
        // Route directly to the forced instance based on content type
        if (contentType === 'movie') {
          await this.fastify.radarrManager.routeItemToRadarr(
            item as RadarrItem,
            key,
            // RSS workflow uses userId=0 for temporary keys during initial content grab
            // These are filtered out by updateWatchlistItem() before database insertion
            options.userId || 0,
            options.forcedInstanceId,
            options.syncing,
          )
        } else {
          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            // RSS workflow uses userId=0 for temporary keys during initial content grab
            // These are filtered out by updateWatchlistItem() before database insertion
            options.userId || 0,
            options.forcedInstanceId,
            options.syncing,
          )
        }
        routedInstances.push(options.forcedInstanceId)
        return { routedInstances }
      } catch (error) {
        this.log.error(
          { error },
          `Error force-routing "${item.title}" to instance ${options.forcedInstanceId}`,
        )
        throw error
      }
    }

    this.log.info(
      `Routing ${contentType} "${item.title}"${options.syncing ? ' during sync operation' : ''}`,
    )

    // OPTIMIZATION: Check if any router rules exist at all
    let hasAnyRules = false
    try {
      hasAnyRules = await this.fastify.db.hasAnyRouterRules()
    } catch (error) {
      this.log.error(
        { error },
        `Error checking for router rules for "${item.title}"`,
      )
      // Continue with default routing path on error
    }

    // If no rules exist and we're not in a special routing scenario,
    // skip directly to default routing
    if (!hasAnyRules) {
      if (options.syncing && options.syncTargetInstanceId !== undefined) {
        // If syncing with target instance, route directly to that instance
        this.log.debug(
          `No routing rules exist during sync, using sync target instance ${options.syncTargetInstanceId} for "${item.title}"`,
        )

        try {
          // Actually perform the routing operation
          if (contentType === 'movie') {
            await this.fastify.radarrManager.routeItemToRadarr(
              item as RadarrItem,
              key,
              // RSS workflow uses userId=0 for temporary keys during initial content grab
              // These are filtered out by updateWatchlistItem() before database insertion
              options.userId || 0,
              options.syncTargetInstanceId,
              options.syncing,
            )
          } else {
            await this.fastify.sonarrManager.routeItemToSonarr(
              item as SonarrItem,
              key,
              // RSS workflow uses userId=0 for temporary keys during initial content grab
              // These are filtered out by updateWatchlistItem() before database insertion
              options.userId || 0,
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
        return { routedInstances }
      }

      // Check for approval requirements before default routing
      if (options.userId) {
        const context: RoutingContext = {
          userId: options.userId,
          userName: options.userName,
          itemKey: key,
          contentType,
          syncing: options.syncing,
          syncTargetInstanceId: options.syncTargetInstanceId,
        }

        try {
          // Check if there's already an approval request for this user/content
          if (context.userId) {
            // Use the same content key logic as ApprovalService: Plex key for user association
            const contentKey = context.itemKey || item.guids[0] || ''

            this.log.debug(
              `Checking for existing approval request: userId=${context.userId}, contentKey=${contentKey} (plex key: ${context.itemKey})`,
            )

            const existingResult = await this.checkExistingApprovalRequest(
              context.userId,
              contentKey,
              item,
              context,
            )

            if (existingResult) {
              return existingResult
            }
          }

          // Get all default routing decisions that would be made (default + synced instances)
          const defaultRoutingDecisions =
            await this.getDefaultRoutingDecisions(contentType)

          if (defaultRoutingDecisions.length === 0) {
            this.log.warn(
              `No default instance available for ${contentType}, skipping approval check`,
            )
            // Continue to normal default routing which will handle the error
          } else {
            const approvalResult = await this.checkApprovalRequirements(
              item,
              context,
              defaultRoutingDecisions,
            )

            if (approvalResult.required) {
              this.log.info(
                `Approval required for default routing of "${item.title}" by user ${context.userName || context.userId}: ${approvalResult.reason}`,
              )

              // Create approval request for default routing with actual routing decision
              if (context.userId) {
                this.log.debug(
                  `Creating approval request with userId=${context.userId}, item.title="${item.title}", item.guids=${JSON.stringify(item.guids)}, context.itemKey=${context.itemKey}`,
                )
                const approvalRequest =
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
                        proposedRouting:
                          await this.createProposedRoutingDecision(
                            defaultRoutingDecisions,
                            contentType,
                          ),
                      },
                    },
                    approvalResult.trigger || 'manual_flag',
                    approvalResult.reason,
                    undefined,
                    context.itemKey,
                  )

                // Auto-approve if bypass is enabled
                if (approvalResult.data?.autoApprove) {
                  this.log.info(
                    `Auto-approving request ${approvalRequest.id} for user ${context.userId} due to bypass setting`,
                  )

                  // First approve the request
                  const approvedRequest = await this.fastify.db.approveRequest(
                    approvalRequest.id,
                    context.userId,
                    'Auto-approved (bypass enabled)',
                  )

                  if (approvedRequest) {
                    // Then process the approved request
                    await this.fastify.approvalService.processApprovedRequest(
                      approvedRequest,
                    )
                  }

                  // Continue with normal routing flow since it's been auto-approved
                  const defaultRoutedInstances = await this.routeUsingDefault(
                    item,
                    key,
                    contentType,
                    context.userId,
                    options.syncing,
                  )
                  return { routedInstances: defaultRoutedInstances }
                }
              }

              // Return empty - content will not be routed until approved
              return { routedInstances: [] }
            }
          }
        } catch (error) {
          this.log.error(
            { error },
            `Error checking approval requirements for default routing of "${item.title}"`,
          )
          // Log the full error details for debugging
          if (error instanceof Error) {
            this.log.error({ error }, `Error details: ${error.message}`)
            this.log.error({ error }, `Error stack: ${error.stack}`)
          }
          // On error, continue with normal default routing
        }
      }

      // Otherwise use default routing
      this.log.info(
        `No routing rules exist, using default routing for "${item.title}"`,
      )
      const defaultRoutedInstances = await this.routeUsingDefault(
        item,
        key,
        contentType,
        // RSS workflow uses userId=0 for temporary keys during initial content grab
        // These are filtered out by updateWatchlistItem() before database insertion
        options.userId || 0,
        options.syncing,
      )

      // Create auto-approval record for default routing
      if (defaultRoutedInstances.length > 0) {
        const context: RoutingContext = {
          userId: options.userId,
          userName: options.userName,
          itemKey: key,
          contentType,
          syncing: options.syncing,
          syncTargetInstanceId: options.syncTargetInstanceId,
        }

        // Get actual routing information from the primary instance that was routed to
        const actualRouting = await this.getActualRoutingFromInstance(
          defaultRoutedInstances[0],
          contentType,
        )

        await this.createAutoApprovalRecord(
          item,
          context,
          defaultRoutedInstances,
          [],
          actualRouting,
        )
      }

      return { routedInstances: defaultRoutedInstances }
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

    // IMPORTANT: Enrich item with metadata before evaluation
    // Only do this if we have rules that might use the enriched data
    let enrichedItem = item
    if (hasAnyRules) {
      try {
        enrichedItem = await this.enrichItemMetadata(item, context)
      } catch (error) {
        this.log.error(
          { error },
          `Failed to enrich metadata for "${item.title}"`,
        )
        // Continue with original item if enrichment fails
      }
    }

    // Step 2: Evaluate all applicable evaluators to get routing decisions
    const allDecisions: RoutingDecision[] = []
    const processedInstanceIds = new Set<number>() // Track instances we've routed to

    // Only collect decisions from evaluators if we have rules
    if (hasAnyRules) {
      // Collect all decisions from all evaluators
      for (const evaluator of this.evaluators) {
        try {
          // Only apply evaluators that are relevant for this content
          const canEvaluate = await evaluator.canEvaluate(enrichedItem, context)
          if (!canEvaluate) continue

          // Get decisions from this evaluator
          const decisions = await evaluator.evaluate(enrichedItem, context)
          if (decisions && decisions.length > 0) {
            this.log.debug(
              `Evaluator "${evaluator.name}" returned ${decisions.length} routing decisions for "${enrichedItem.title}"`,
            )
            allDecisions.push(...decisions)
          }
        } catch (evaluatorError) {
          this.log.error(
            { error: evaluatorError },
            `Error in evaluator "${evaluator.name}" when routing "${enrichedItem.title}"`,
          )
        }
      }
    }

    // Step 3: Handle case where no evaluator returned any decisions
    if (allDecisions.length === 0) {
      // 3a: If syncing with target instance, use that as fallback
      if (options.syncing && options.syncTargetInstanceId !== undefined) {
        this.log.info(
          `No routing decisions returned for "${item.title}" during sync, using sync target instance ${options.syncTargetInstanceId}`,
        )

        try {
          if (contentType === 'movie') {
            await this.fastify.radarrManager.routeItemToRadarr(
              item as RadarrItem,
              key,
              // RSS workflow uses userId=0 for temporary keys during initial content grab
              // These are filtered out by updateWatchlistItem() before database insertion
              options.userId || 0,
              options.syncTargetInstanceId,
              options.syncing,
            )
          } else {
            await this.fastify.sonarrManager.routeItemToSonarr(
              item as SonarrItem,
              key,
              // RSS workflow uses userId=0 for temporary keys during initial content grab
              // These are filtered out by updateWatchlistItem() before database insertion
              options.userId || 0,
              options.syncTargetInstanceId,
              options.syncing,
            )
          }
          routedInstances.push(options.syncTargetInstanceId)

          // Note: Sync operations are intentionally excluded from auto-approval records
          // as they represent internal data movement, not new content additions
        } catch (error) {
          this.log.error(
            { error },
            `Error routing "${item.title}" to sync target instance ${options.syncTargetInstanceId}`,
          )
        }
      }
      // 3b: For normal operations, fall back to default instance routing
      else {
        this.log.info(
          `No matching routing rules for "${item.title}", using default routing`,
        )

        // Check for approval requirements before default routing
        if (options.userId) {
          const context: RoutingContext = {
            userId: options.userId,
            userName: options.userName,
            itemKey: key,
            contentType,
            syncing: options.syncing,
            syncTargetInstanceId: options.syncTargetInstanceId,
          }

          try {
            // FIRST: Check if there's already an approval request for this user/content
            // This prevents previously rejected items from being re-routed
            if (context.userId) {
              const contentKey = context.itemKey || item.guids[0] || ''

              const existingResult = await this.checkExistingApprovalRequest(
                context.userId,
                contentKey,
                item,
                context,
              )

              if (existingResult) {
                return existingResult
              }
            }

            // SECOND: Check if new approval is required based on router rules
            // Get all default routing decisions that would be made
            const defaultRoutingDecisions =
              await this.getDefaultRoutingDecisions(contentType)

            if (defaultRoutingDecisions.length > 0) {
              const approvalResult = await this.checkApprovalRequirements(
                item,
                context,
                defaultRoutingDecisions,
              )

              if (approvalResult.required) {
                this.log.info(
                  `Approval required for default routing of "${item.title}" by user ${context.userName || context.userId}: ${approvalResult.reason}`,
                )

                // Create approval request for default routing
                if (context.userId) {
                  const approvalRequest =
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
                          proposedRouting:
                            await this.createProposedRoutingDecision(
                              defaultRoutingDecisions,
                              contentType,
                            ),
                        },
                      },
                      approvalResult.trigger || 'manual_flag',
                      approvalResult.reason,
                      undefined,
                      context.itemKey,
                    )

                  if (approvalRequest) {
                    this.log.info(
                      `New approval request created for "${item.title}" by user ${context.userId}`,
                    )
                  }
                }

                // Return empty - content will not be routed until approved
                return { routedInstances: [] }
              }
            }
          } catch (error) {
            this.log.error(
              { error },
              `Error checking approval requirements for default routing of "${item.title}"`,
            )
            // Continue with normal routing on error
          }
        }

        // Default routing will handle routing to default instance and any synced instances
        const defaultRoutedInstances = await this.routeUsingDefault(
          item,
          key,
          contentType,
          // RSS workflow uses userId=0 for temporary keys during initial content grab
          // These are filtered out by updateWatchlistItem() before database insertion
          options.userId || 0,
          options.syncing,
        )
        routedInstances.push(...defaultRoutedInstances)

        // Create auto-approval record for fallback default routing
        if (defaultRoutedInstances.length > 0) {
          const context: RoutingContext = {
            userId: options.userId,
            userName: options.userName,
            itemKey: key,
            contentType,
            syncing: options.syncing,
            syncTargetInstanceId: options.syncTargetInstanceId,
          }

          // Get actual routing information from the primary instance that was routed to
          const actualRouting = await this.getActualRoutingFromInstance(
            defaultRoutedInstances[0],
            contentType,
          )

          await this.createAutoApprovalRecord(
            item,
            context,
            defaultRoutedInstances,
            [],
            actualRouting,
          )
        }
      }

      return { routedInstances }
    }

    // Step 4: Check for approval requirements before processing routing decisions

    // If we have routing decisions and user context, check if approval is required
    if (allDecisions.length > 0 && context.userId) {
      try {
        // FIRST: Check if there's already an approval request for this user/content
        // This prevents previously rejected items from being re-routed
        const contentKey = context.itemKey || enrichedItem.guids[0] || ''

        const existingResult = await this.checkExistingApprovalRequest(
          context.userId,
          contentKey,
          enrichedItem,
          context,
        )

        if (existingResult) {
          return existingResult
        }

        // SECOND: Sort decisions by priority for approval checking
        allDecisions.sort((a, b) => (b.priority || 50) - (a.priority || 50))

        // Check if approval is required for these routing decisions
        const approvalResult = await this.checkApprovalRequirements(
          enrichedItem,
          context,
          allDecisions,
        )

        if (approvalResult.required) {
          this.log.info(
            `Approval required for "${enrichedItem.title}" by user ${context.userName || context.userId}: ${approvalResult.reason}`,
          )

          // Store the approval request with the highest priority routing decision
          const primaryDecision = allDecisions[0] // Already sorted by priority

          const approvalRequest =
            await this.fastify.approvalService.createApprovalRequest(
              {
                id: context.userId,
                name: context.userName || `User ${context.userId}`,
              },
              enrichedItem,
              {
                action: 'require_approval',
                approval: {
                  reason: approvalResult.reason || 'Approval required',
                  triggeredBy: approvalResult.trigger || 'manual_flag',
                  data: approvalResult.data || {},
                  proposedRouting: primaryDecision
                    ? {
                        instanceId: primaryDecision.instanceId,
                        instanceType:
                          enrichedItem.type === 'movie' ? 'radarr' : 'sonarr',
                        qualityProfile: primaryDecision.qualityProfile,
                        rootFolder: primaryDecision.rootFolder,
                        tags: primaryDecision.tags,
                        priority: primaryDecision.priority,
                        searchOnAdd: primaryDecision.searchOnAdd,
                        seasonMonitoring: primaryDecision.seasonMonitoring,
                        seriesType: primaryDecision.seriesType,
                        minimumAvailability:
                          primaryDecision.minimumAvailability,
                      }
                    : undefined,
                },
              },
              approvalResult.trigger || 'manual_flag',
              approvalResult.reason,
              undefined,
              context.itemKey,
            )

          // Auto-approve if bypass is enabled
          if (approvalResult.data?.autoApprove) {
            this.log.info(
              `Auto-approving request ${approvalRequest.id} for user ${context.userId} due to bypass setting`,
            )

            // First approve the request
            const approvedRequest = await this.fastify.db.approveRequest(
              approvalRequest.id,
              context.userId,
              'Auto-approved (bypass enabled)',
            )

            if (approvedRequest) {
              // Then process the approved request
              await this.fastify.approvalService.processApprovedRequest(
                approvedRequest,
              )
            }

            // Continue with normal routing flow since it's been auto-approved
            const routedInstanceIds = allDecisions.map((d) => d.instanceId)
            return { routedInstances: routedInstanceIds }
          }

          // Return empty - content will not be routed until approved
          return { routedInstances: [] }
        }
      } catch (error) {
        this.log.error(
          { error },
          `Error checking approval requirements for "${enrichedItem.title}"`,
        )
        // On error, continue with normal routing
      }
    }

    // Step 5: Process decisions from evaluators (normal routing path)

    // Sort decisions by priority if not already sorted from approval check
    if (allDecisions.length > 0) {
      allDecisions.sort((a, b) => (b.priority || 50) - (a.priority || 50))
    }

    let routeCount = 0
    let firstActualRouting:
      | {
          instanceId: number
          instanceType: 'radarr' | 'sonarr'
          qualityProfile?: number | string | null
          rootFolder?: string | null
          tags?: string[]
          searchOnAdd?: boolean | null
          minimumAvailability?: string | null
          seasonMonitoring?: string | null
          seriesType?: string | null
        }
      | undefined

    // Process each decision in priority order
    for (const decision of allDecisions) {
      // Skip if we've already routed to this instance - only use highest priority decision per instance
      if (processedInstanceIds.has(decision.instanceId)) {
        this.log.debug(
          `Skipping duplicate routing to instance ${decision.instanceId} for "${item.title}"`,
        )
        continue
      }

      // Mark this instance as processed to prevent lower priority rules for same instance
      processedInstanceIds.add(decision.instanceId)

      this.log.info(
        `Routing "${item.title}" to instance ID ${decision.instanceId} with priority ${decision.priority || 50}${decision.tags?.length ? ` and tags: ${decision.tags.join(', ')}` : ''}`,
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
            // RSS workflow uses userId=0 for temporary keys during initial content grab
            // These are filtered out by updateWatchlistItem() before database insertion
            options.userId || 0,
            decision.instanceId,
            options.syncing,
            rootFolder,
            decision.qualityProfile,
            decision.tags,
            decision.searchOnAdd,
            decision.minimumAvailability,
          )

          // Capture the ACTUAL routing parameters that were sent (first success only)
          if (!firstActualRouting) {
            // Get the Radarr instance to resolve actual values
            const radarrInstance = await this.fastify.db.getRadarrInstance(
              decision.instanceId,
            )
            if (radarrInstance) {
              // Resolve values using the same logic as RadarrManagerService
              const toNum = (v: unknown): number | undefined => {
                if (typeof v === 'number')
                  return Number.isInteger(v) && v > 0 ? v : undefined
                if (typeof v === 'string') {
                  const s = v.trim()
                  const n = /^\d+$/.test(s) ? Number(s) : NaN
                  return Number.isInteger(n) && n > 0 ? n : undefined
                }
                return undefined
              }

              const targetRootFolder =
                rootFolder || radarrInstance.rootFolder || undefined
              const qpSource =
                decision.qualityProfile ?? radarrInstance.qualityProfile
              const targetQualityProfileId =
                qpSource == null ? undefined : toNum(qpSource)
              const targetTags = [
                ...new Set(decision.tags ?? radarrInstance.tags ?? []),
              ]
              const targetSearchOnAdd =
                decision.searchOnAdd ?? radarrInstance.searchOnAdd ?? true
              const targetMinimumAvailability =
                decision.minimumAvailability ??
                radarrInstance.minimumAvailability ??
                'released'

              firstActualRouting = {
                instanceId: decision.instanceId,
                instanceType: 'radarr',
                qualityProfile: targetQualityProfileId?.toString(),
                rootFolder: targetRootFolder,
                tags: targetTags,
                searchOnAdd: targetSearchOnAdd,
                minimumAvailability: targetMinimumAvailability,
              }
            }
          }
        } else {
          // Convert rootFolder from string|null|undefined to string|undefined
          const rootFolder =
            decision.rootFolder === null ? undefined : decision.rootFolder

          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            // RSS workflow uses userId=0 for temporary keys during initial content grab
            // These are filtered out by updateWatchlistItem() before database insertion
            options.userId || 0,
            decision.instanceId,
            options.syncing,
            rootFolder,
            decision.qualityProfile,
            decision.tags,
            decision.searchOnAdd,
            decision.seasonMonitoring,
            decision.seriesType,
          )

          // Capture the ACTUAL routing parameters that were sent (first success only)
          if (!firstActualRouting) {
            // Get the Sonarr instance to resolve actual values
            const sonarrInstance = await this.fastify.db.getSonarrInstance(
              decision.instanceId,
            )
            if (sonarrInstance) {
              // Resolve values using the same logic as SonarrManagerService
              const toNum = (v: unknown): number | undefined => {
                if (typeof v === 'number')
                  return Number.isInteger(v) && v > 0 ? v : undefined
                if (typeof v === 'string') {
                  const s = v.trim()
                  const n = /^\d+$/.test(s) ? Number(s) : NaN
                  return Number.isInteger(n) && n > 0 ? n : undefined
                }
                return undefined
              }

              const targetRootFolder =
                rootFolder || sonarrInstance.rootFolder || undefined
              const qpSource =
                decision.qualityProfile ?? sonarrInstance.qualityProfile
              const targetQualityProfileId =
                qpSource == null ? undefined : toNum(qpSource)
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

              firstActualRouting = {
                instanceId: decision.instanceId,
                instanceType: 'sonarr',
                qualityProfile: targetQualityProfileId?.toString(),
                rootFolder: targetRootFolder,
                tags: targetTags,
                searchOnAdd: targetSearchOnAdd,
                seasonMonitoring: targetSeasonMonitoring,
                seriesType: targetSeriesType,
              }
            }
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

    // Step 5: Special handling for sync operations
    // Log if sync target wasn't included in routing decisions (rules prevented sync)
    if (
      options.syncing &&
      options.syncTargetInstanceId !== undefined &&
      !routedInstances.includes(options.syncTargetInstanceId)
    ) {
      this.log.info(
        `Sync target instance ${options.syncTargetInstanceId} was not included in routing decisions for "${item.title}". Routing rules prevented sync to this instance.`,
      )
    }

    this.log.info(
      `Successfully routed "${item.title}" to ${routeCount} instances`,
    )

    // Record quota usage if user has quotas enabled and routing was successful
    // Only count once per content item regardless of how many instances it was routed to
    if (
      options.userId &&
      options.userId > 0 &&
      !options.syncing &&
      routedInstances.length > 0
    ) {
      const recorded = await this.fastify.quotaService.recordUsage(
        options.userId,
        contentType,
      )
      if (recorded) {
        this.log.info(
          `Recorded quota usage for user ${options.userId}: ${item.title}`,
        )
      }
    }

    // Create auto-approval record for tracking all successful content additions
    if (routedInstances.length > 0) {
      await this.createAutoApprovalRecord(
        enrichedItem,
        context,
        routedInstances,
        allDecisions,
        firstActualRouting,
      )
    }

    return { routedInstances }
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
  ): Promise<{ routedInstances: number[] } | null> {
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
        return { routedInstances: [] }

      case 'approved':
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
        return { routedInstances: [] }

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
        return { routedInstances: [] }
    }
  }

  /**
   * Enriches a content item with additional metadata by making API calls to Radarr/Sonarr.
   * This is used to provide evaluators with more information for making routing decisions.
   * The enrichment happens once per routing operation to avoid duplicate API calls.
   *
   * @param item - The content item to enrich
   * @param context - Routing context with content type and other info
   * @returns Promise with the enriched content item
   */
  private async enrichItemMetadata(
    item: ContentItem,
    context: RoutingContext,
  ): Promise<ContentItem> {
    const isMovie = context.contentType === 'movie'

    // Skip if we can't extract an ID from the item
    if (!Array.isArray(item.guids) || item.guids.length === 0) {
      return item
    }

    // Extract appropriate ID based on content type (tmdb for movies, tvdb for shows)
    let itemId: number | undefined

    if (isMovie) {
      itemId = extractTmdbId(item.guids)
    } else {
      itemId = extractTvdbId(item.guids)
    }

    // Skip enrichment if we couldn't extract a valid ID
    if (!itemId || Number.isNaN(itemId)) {
      this.log.debug(
        `Couldn't extract ID from item "${item.title}", skipping metadata enrichment`,
      )
      return item
    }

    try {
      // Fetch metadata from appropriate API based on content type
      if (isMovie) {
        // Get Radarr service for movie lookups using default instance
        let defaultInstance: RadarrInstance | null = null
        try {
          defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
          if (!defaultInstance) {
            this.log.warn(
              'No default Radarr instance available for metadata lookup',
            )
            return item
          }
          this.log.debug(
            `Default Radarr instance found for "${item.title}": ${defaultInstance.id}`,
          )
        } catch (error) {
          this.log.error(
            { error },
            `Database error fetching default Radarr instance for metadata lookup of "${item.title}"`,
          )
          return item
        }

        const lookupService = this.fastify.radarrManager.getRadarrService(
          defaultInstance.id,
        )

        if (!lookupService) {
          this.log.warn(
            `Radarr service for instance ${defaultInstance.id} not available for metadata lookup`,
          )
          return item
        }

        this.log.debug(
          `Calling Radarr API for "${item.title}" with TMDB ID: ${itemId}`,
        )
        // Call Radarr API to get movie details
        const apiResponse = await lookupService.getFromRadarr<
          RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
        >(`movie/lookup/tmdb?tmdbId=${itemId}`)
        this.log.debug(`Radarr API response received for "${item.title}"`)

        let movieMetadata: RadarrMovieLookupResponse | undefined

        // Handle both array and single object responses
        if (Array.isArray(apiResponse) && apiResponse.length > 0) {
          movieMetadata = apiResponse[0]
        } else if (!Array.isArray(apiResponse)) {
          movieMetadata = apiResponse
        }

        // Add metadata to the item if found
        if (movieMetadata) {
          this.log.debug(
            `Movie metadata found for "${item.title}", checking anime status`,
          )

          // Fetch IMDB rating data first (outside try block for scope)
          let imdbData:
            | { rating?: number | null; votes?: number | null }
            | undefined

          // Try to get IMDb ID from guids first, then fallback to metadata
          let imdbId = extractImdbId(item.guids)?.toString()
          if ((!imdbId || imdbId === '0') && movieMetadata?.imdbId) {
            imdbId = movieMetadata.imdbId.replace(/^tt/, '')
          }

          if (imdbId && imdbId !== '0' && this.fastify.imdb) {
            try {
              const imdbRating = await this.fastify.imdb.getRating(item.guids)
              if (imdbRating) {
                imdbData = {
                  rating: imdbRating.rating,
                  votes: imdbRating.votes,
                }
              } else {
                // Lookup succeeded but no rating found - mark as known missing
                imdbData = {
                  rating: null,
                  votes: null,
                }
              }
            } catch (error) {
              this.log.debug(
                { error, scope: 'enrichItemMetadata' },
                `Failed to fetch IMDb rating for "${item.title}"`,
              )
            }
          }

          // Check anime status before returning
          try {
            const tvdbId = extractTvdbId(item.guids)?.toString()
            const tmdbId = extractTmdbId(item.guids)?.toString()

            this.log.debug(
              `Anime check for "${item.title}": tvdbId=${tvdbId || 'none'}, tmdbId=${tmdbId || 'none'}, imdbId=${imdbId || 'none'}`,
            )

            // Check if this content is anime
            if (tvdbId || tmdbId || imdbId) {
              let isAnimeContent = false
              if (this.fastify.anime) {
                isAnimeContent = await this.fastify.anime.isAnime(
                  tvdbId,
                  tmdbId,
                  imdbId,
                )
              }
              this.log.debug(
                `Anime result for "${item.title}": ${isAnimeContent}`,
              )

              if (isAnimeContent) {
                // Add "anime" to the genres for evaluation
                const existingGenres = Array.isArray(item.genres)
                  ? item.genres
                  : []
                const genresLowercase = existingGenres.map((g) =>
                  g.toLowerCase(),
                )
                this.log.debug(
                  `Adding anime genre to "${item.title}", existing genres: [${existingGenres.join(', ')}]`,
                )
                if (!genresLowercase.includes('anime')) {
                  const enrichedGenres = [...existingGenres, 'anime']
                  this.log.debug(
                    `Enriched "${item.title}" with new genres: [${enrichedGenres.join(', ')}]`,
                  )
                  return {
                    ...item,
                    metadata: movieMetadata,
                    genres: enrichedGenres,
                    ...(imdbData && { imdb: imdbData }),
                  }
                }
              }
            }
          } catch (error) {
            this.log.debug(
              'Failed to check anime status during enrichment:',
              error,
            )
          }

          return {
            ...item,
            metadata: movieMetadata,
            ...(imdbData && { imdb: imdbData }),
          }
        }
      } else {
        // Get Sonarr service for TV show lookups using default instance
        let defaultInstance: SonarrInstance | null = null
        try {
          defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
          if (!defaultInstance) {
            this.log.warn(
              'No default Sonarr instance available for metadata lookup',
            )
            return item
          }
        } catch (error) {
          this.log.error(
            { error },
            `Database error fetching default Sonarr instance for metadata lookup of "${item.title}"`,
          )
          return item
        }

        const lookupService = this.fastify.sonarrManager.getSonarrService(
          defaultInstance.id,
        )

        if (!lookupService) {
          this.log.warn(
            `Sonarr service for instance ${defaultInstance.id} not available for metadata lookup`,
          )
          return item
        }

        // Call Sonarr API to get show details
        const apiResponse = await lookupService.getFromSonarr<
          SonarrSeriesLookupResponse | SonarrSeriesLookupResponse[]
        >(`series/lookup?term=tvdb:${itemId}`)

        let seriesMetadata: SonarrSeriesLookupResponse | undefined

        // Handle both array and single object responses
        if (Array.isArray(apiResponse) && apiResponse.length > 0) {
          seriesMetadata = apiResponse[0]
        } else if (!Array.isArray(apiResponse)) {
          seriesMetadata = apiResponse
        }

        // Add metadata to the item if found
        if (seriesMetadata) {
          // Fetch IMDB rating data for TV shows too
          let imdbData:
            | { rating?: number | null; votes?: number | null }
            | undefined
          if (this.fastify.imdb) {
            try {
              const imdbRating = await this.fastify.imdb.getRating(item.guids)
              if (imdbRating) {
                imdbData = {
                  rating: imdbRating.rating,
                  votes: imdbRating.votes,
                }
                this.log.debug(
                  `IMDB data for TV show "${item.title}": rating=${imdbRating.rating}, votes=${imdbRating.votes}`,
                )
              } else {
                // Lookup succeeded but no rating found - mark as known missing
                imdbData = {
                  rating: null,
                  votes: null,
                }
              }
            } catch (error) {
              this.log.debug(
                `Failed to fetch IMDB rating for TV show "${item.title}":`,
                error,
              )
            }
          }

          return {
            ...item,
            metadata: seriesMetadata,
            ...(imdbData && { imdb: imdbData }),
          }
        }
      }
    } catch (error) {
      this.log.error({ error }, `Error enriching metadata for "${item.title}"`)
    }

    // Return original item if enrichment failed
    return item
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
        evaluator.canEvaluateConditionField &&
        evaluator.canEvaluateConditionField(field)
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

    // If no specific field handler found, try any evaluator with condition support
    for (const evaluator of this.evaluators) {
      if (evaluator.evaluateCondition) {
        try {
          const result = evaluator.evaluateCondition(condition, item, context)
          return result
        } catch (_e) {
          // Ignore errors, try the next evaluator
        }
      }
    }

    // Log warning if no evaluator could handle this field
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
  ): Promise<number[]> {
    try {
      // Get all instances that should be routed to (using shared logic)
      const instanceIds = await this.getDefaultRoutingInstanceIds(contentType)
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

      // Record quota usage if user has quotas enabled and routing was successful
      // Only count once per content item regardless of how many instances it was routed to
      if (userId && userId > 0 && !syncing && routedInstances.length > 0) {
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
    trigger?: import('@root/types/approval.types.js').ApprovalTrigger
    data?: import('@root/types/approval.types.js').ApprovalData
  }> {
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
      const allRouterRules = await this.fastify.db.getAllRouterRules()
      let quotasBypassedByRule = false

      for (const rule of allRouterRules) {
        if (!rule.enabled) continue

        // Check if this rule matches the current context
        if (rule.criteria && typeof rule.criteria === 'object') {
          try {
            const condition = rule.criteria.condition as ConditionGroup
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

      // PRIORITY 3: Quota exceeded (resource management)
      const userQuota = await this.fastify.db.getUserQuota(
        context.userId,
        item.type,
      )
      const userBypassesQuotas = userQuota?.bypassApproval || false

      const quotaStatus = await this.fastify.quotaService.getUserQuotaStatus(
        context.userId,
        item.type,
      )

      if (quotaStatus) {
        // Check if adding this item would exceed quota (predictive check)
        const wouldExceedAfterAddition =
          quotaStatus.currentUsage + 1 > quotaStatus.quotaLimit

        if (wouldExceedAfterAddition) {
          // Determine if this should be auto-approved due to bypass settings
          const shouldAutoApprove = quotasBypassedByRule || userBypassesQuotas

          // Show the "would-be" usage count (current + 1)
          const wouldBeUsage = quotaStatus.currentUsage + 1

          return {
            required: true,
            reason: shouldAutoApprove
              ? `${quotaStatus.quotaType} quota would be exceeded (auto-approved due to bypass)`
              : `${quotaStatus.quotaType} quota exceeded (${wouldBeUsage}/${quotaStatus.quotaLimit})`,
            trigger: 'quota_exceeded',
            data: {
              quotaType: quotaStatus.quotaType,
              quotaUsage: wouldBeUsage,
              quotaLimit: quotaStatus.quotaLimit,
              autoApprove: shouldAutoApprove,
            },
          }
        }
      }

      return { required: false }
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
   * Gets default instance IDs for a specific content type
   */
  private async getDefaultInstanceIds(
    contentType: 'movie' | 'show',
  ): Promise<{ instanceIds: number[]; error?: string }> {
    try {
      const instanceIds: number[] = []

      if (contentType === 'movie') {
        const defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
        if (!defaultInstance) {
          return { instanceIds: [], error: 'No default Radarr instance found' }
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
          return { instanceIds: [], error: 'No default Sonarr instance found' }
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
      return {
        instanceIds: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Gets all instances that would be used for default routing (default + synced instances)
   * without actually executing the routing. This is a shared helper used by both
   * actual routing and approval checking to ensure identical behavior.
   *
   * @param contentType - Type of content ('movie' or 'show')
   * @returns Promise resolving to array of instance IDs that would be routed to
   */
  private async getDefaultRoutingInstanceIds(
    contentType: 'movie' | 'show',
  ): Promise<number[]> {
    try {
      const result = await this.getDefaultInstanceIds(contentType)
      if (result.error) {
        this.log.warn(result.error)
      }
      return result.instanceIds
    } catch (error) {
      this.log.error(
        { error },
        `Error in getting default routing instances for ${contentType}`,
      )
      return []
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
      const instanceIds = await this.getDefaultRoutingInstanceIds(contentType)
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
            decisions.push({
              instanceId: instance.id,
              qualityProfile: instance.qualityProfile || null,
              rootFolder: instance.rootFolder || null,
              tags: instance.tags || [],
              priority: 50, // Default priority
              searchOnAdd: instance.searchOnAdd ?? null,
              minimumAvailability: instance.minimumAvailability || undefined,
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
            decisions.push({
              instanceId: instance.id,
              qualityProfile: instance.qualityProfile || null,
              rootFolder: instance.rootFolder || null,
              tags: instance.tags || [],
              priority: 50, // Default priority
              searchOnAdd: instance.searchOnAdd ?? null,
              seasonMonitoring: instance.seasonMonitoring || null,
              seriesType: instance.seriesType || null,
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
   * Creates a proposed routing decision that includes primary instance and synced instances
   */
  private async createProposedRoutingDecision(
    routingDecisions: RoutingDecision[],
    contentType: 'movie' | 'show',
  ): Promise<NonNullable<RouterDecision['approval']>['proposedRouting']> {
    if (routingDecisions.length === 0) {
      return undefined
    }

    // Use the primary routing decision (first one) as the base
    const primaryDecision = routingDecisions[0]

    // Extract synced instance IDs from the routing decisions (skip the first one which is primary)
    const syncedInstances = routingDecisions
      .slice(1)
      .map((decision) => decision.instanceId)

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
      syncedInstances: syncedInstances.length > 0 ? syncedInstances : undefined,
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
    actualRouting?: {
      instanceId: number
      instanceType: 'radarr' | 'sonarr'
      qualityProfile?: number | string | null
      rootFolder?: string | null
      tags?: string[]
      searchOnAdd?: boolean | null
      minimumAvailability?: string | null
      seasonMonitoring?: string | null
      seriesType?: string | null
    },
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
      if (context.userId && context.itemKey) {
        const existingRequest =
          await this.fastify.db.getApprovalRequestByContent(
            context.userId,
            context.itemKey,
          )
        if (existingRequest) {
          this.log.debug(
            `Auto-approval record already exists for ${item.title}, skipping`,
          )
          return
        }
      }

      // Use provided user or system user (0) for RSS/immediate processing
      const userId = context.userId || 0
      const _userName =
        context.userName || (userId === 0 ? 'System' : `User ${userId}`)

      // Use actual routing that was executed, not proposed routing
      let proposedRouting: RouterDecision['routing'] | undefined
      const syncedInstances = routedInstances.slice(1) // All instances except the first

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
          syncedInstances:
            syncedInstances.length > 0 ? syncedInstances : undefined,
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
          syncedInstances:
            syncedInstances.length > 0 ? syncedInstances : undefined,
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
          syncedInstances:
            syncedInstances.length > 0 ? syncedInstances : undefined,
        }
      }

      // Create a direct auto-approval tracking record (bypass approval workflow)
      // This creates the record with 'pending' status initially, then we'll update it
      // Use the same structure as regular approval requests for UI compatibility
      const approvalRequest = await this.fastify.db.createApprovalRequest({
        userId,
        contentType: context.contentType as 'movie' | 'show',
        contentTitle: item.title,
        contentKey: context.itemKey || item.guids[0] || 'unknown',
        contentGuids: item.guids,
        routerDecision: {
          action: 'require_approval',
          approval: {
            data: {},
            reason: 'Auto-added (no approval required)',
            triggeredBy: 'manual_flag',
            proposedRouting: proposedRouting,
          },
        },
        triggeredBy: 'manual_flag',
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
    approvedRequest: import('@root/types/approval.types.js').ApprovalRequest,
    item: ContentItem,
    context: RoutingContext,
  ): Promise<{ routedInstances: number[] }> {
    try {
      const proposedRouting =
        approvedRequest.proposedRouterDecision?.approval?.proposedRouting

      if (!proposedRouting || !proposedRouting.instanceId) {
        this.log.error(
          { approvedRequest },
          'Approved request has invalid routing decision',
        )
        return { routedInstances: [] }
      }

      const routedInstances: number[] = []
      const instanceId = proposedRouting.instanceId
      const contentType = approvedRequest.contentType

      if (contentType === 'movie') {
        try {
          await this.fastify.radarrManager.routeItemToRadarr(
            item as RadarrItem,
            context.itemKey,
            context.userId || 1,
            instanceId,
            context.syncing,
            proposedRouting.rootFolder || undefined,
            proposedRouting.qualityProfile,
            proposedRouting.tags || [],
            proposedRouting.searchOnAdd,
            proposedRouting.minimumAvailability,
          )
          routedInstances.push(instanceId)
          this.log.info(
            `Successfully routed approved content "${item.title}" to Radarr instance ${instanceId}`,
          )
        } catch (error) {
          this.log.error(
            { error },
            `Failed to route approved content "${item.title}" to Radarr instance ${instanceId}`,
          )
        }
      } else {
        try {
          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            context.itemKey,
            context.userId || 1,
            instanceId,
            context.syncing,
            proposedRouting.rootFolder || undefined,
            proposedRouting.qualityProfile,
            proposedRouting.tags || [],
            proposedRouting.searchOnAdd,
            proposedRouting.seasonMonitoring,
          )
          routedInstances.push(instanceId)
          this.log.info(
            `Successfully routed approved content "${item.title}" to Sonarr instance ${instanceId}`,
          )
        } catch (error) {
          this.log.error(
            { error },
            `Failed to route approved content "${item.title}" to Sonarr instance ${instanceId}`,
          )
        }
      }

      return { routedInstances }
    } catch (error) {
      this.log.error({ error }, 'Error routing using approved decision')
      return { routedInstances: [] }
    }
  }

  /**
   * Gets the actual routing configuration from an instance for auto-approval records.
   * This ensures default routing captures the same information as rule-based routing.
   */
  private async getActualRoutingFromInstance(
    instanceId: number,
    contentType: 'movie' | 'show',
  ): Promise<
    | {
        instanceId: number
        instanceType: 'radarr' | 'sonarr'
        qualityProfile?: number | string | null
        rootFolder?: string | null
        tags?: string[]
        searchOnAdd?: boolean | null
        minimumAvailability?: string | null
        seasonMonitoring?: string | null
        seriesType?: string | null
      }
    | undefined
  > {
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
}
