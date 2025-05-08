import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  ConditionGroup,
  FieldInfo,
  OperatorInfo,
} from '@root/types/router.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import { resolve, join, dirname } from 'node:path'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'
import { extractTmdbId, extractTvdbId } from '@utils/guid-handler.js'

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

  constructor(
    private readonly log: FastifyBaseLogger,
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

      this.log.info(`Loading router evaluators from: ${evaluatorsDir}`)

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
                this.log.info(`Loaded router evaluator: ${evaluator.name}`)
              } else {
                this.log.warn(
                  `Invalid evaluator found: ${file}, missing required methods or properties`,
                )
              }
            }
          } catch (err) {
            this.log.error(`Error loading evaluator ${file}:`, err)
          }
        }
      }

      // Sort evaluators by priority (highest first) so they execute in priority order
      this.evaluators.sort((a, b) => b.priority - a.priority)

      this.log.info(
        `Successfully loaded ${this.evaluators.length} router evaluators`,
      )
    } catch (error) {
      this.log.error('Error initializing content router:', error)
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
            options.forcedInstanceId,
            options.syncing,
          )
        } else {
          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            options.forcedInstanceId,
            options.syncing,
          )
        }
        routedInstances.push(options.forcedInstanceId)
        return { routedInstances }
      } catch (error) {
        this.log.error(
          `Error force-routing "${item.title}" to instance ${options.forcedInstanceId}:`,
          error,
        )
        throw error
      }
    }

    this.log.info(
      `Routing ${contentType} "${item.title}"${options.syncing ? ' during sync operation' : ''}`,
    )

    // OPTIMIZATION: Check if any router rules exist at all
    const hasAnyRules = await this.fastify.db.hasAnyRouterRules()

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
              options.syncTargetInstanceId,
              options.syncing,
            )
          } else {
            await this.fastify.sonarrManager.routeItemToSonarr(
              item as SonarrItem,
              key,
              options.syncTargetInstanceId,
              options.syncing,
            )
          }
          routedInstances.push(options.syncTargetInstanceId)
        } catch (error) {
          this.log.error(
            `Error routing "${item.title}" to sync target instance ${options.syncTargetInstanceId}:`,
            error,
          )
          throw error
        }
        return { routedInstances }
      }

      // Otherwise use default routing
      this.log.info(
        `No routing rules exist, using default routing for "${item.title}"`,
      )
      const defaultRoutedInstances = await this.routeUsingDefault(
        item,
        key,
        contentType,
        options.syncing,
      )
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
    const enrichedItem = hasAnyRules
      ? await this.enrichItemMetadata(item, context)
      : item

    if (hasAnyRules) {
      this.log.debug(`Enriched metadata for "${item.title}"`)
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
            `Error in evaluator "${evaluator.name}" when routing "${enrichedItem.title}":`,
            evaluatorError,
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
              options.syncTargetInstanceId,
              options.syncing,
            )
          } else {
            await this.fastify.sonarrManager.routeItemToSonarr(
              item as SonarrItem,
              key,
              options.syncTargetInstanceId,
              options.syncing,
            )
          }
          routedInstances.push(options.syncTargetInstanceId)
        } catch (error) {
          this.log.error(
            `Error routing "${item.title}" to sync target instance ${options.syncTargetInstanceId}:`,
            error,
          )
        }
      }
      // 3b: For normal operations, fall back to default instance routing
      else {
        this.log.info(
          `No matching routing rules for "${item.title}", using default routing`,
        )
        // Default routing will handle routing to default instance and any synced instances
        const defaultRoutedInstances = await this.routeUsingDefault(
          item,
          key,
          contentType,
          options.syncing,
        )
        routedInstances.push(...defaultRoutedInstances)
      }

      return { routedInstances }
    }

    // Step 4: Process decisions from evaluators

    // Sort decisions by priority (highest first) to ensure we process most important rules first
    // This is crucial since we only route to each instance once (using the highest priority rule)
    allDecisions.sort((a, b) => (b.priority || 50) - (a.priority || 50))

    let routeCount = 0

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
            decision.instanceId,
            options.syncing,
            rootFolder,
            decision.qualityProfile,
            decision.tags,
            decision.searchOnAdd,
            decision.minimumAvailability,
          )
        } else {
          // Convert rootFolder from string|null|undefined to string|undefined
          const rootFolder =
            decision.rootFolder === null ? undefined : decision.rootFolder

          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            decision.instanceId,
            options.syncing,
            rootFolder,
            decision.qualityProfile,
            decision.tags,
            decision.searchOnAdd,
            decision.seasonMonitoring,
          )
        }
        routeCount++
        routedInstances.push(decision.instanceId)
      } catch (routeError) {
        this.log.error(
          `Error routing "${item.title}" to instance ${decision.instanceId}:`,
          routeError,
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

    return { routedInstances }
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
        const defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
        if (!defaultInstance) {
          this.log.warn(
            'No default Radarr instance available for metadata lookup',
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

        // Call Radarr API to get movie details
        const apiResponse = await lookupService.getFromRadarr<
          RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
        >(`movie/lookup/tmdb?tmdbId=${itemId}`)

        let movieMetadata: RadarrMovieLookupResponse | undefined

        // Handle both array and single object responses
        if (Array.isArray(apiResponse) && apiResponse.length > 0) {
          movieMetadata = apiResponse[0]
        } else if (!Array.isArray(apiResponse)) {
          movieMetadata = apiResponse
        }

        // Add metadata to the item if found
        if (movieMetadata) {
          return {
            ...item,
            metadata: movieMetadata,
          }
        }
      } else {
        // Get Sonarr service for TV show lookups using default instance
        const defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
        if (!defaultInstance) {
          this.log.warn(
            'No default Sonarr instance available for metadata lookup',
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
          return {
            ...item,
            metadata: seriesMetadata,
          }
        }
      }
    } catch (error) {
      this.log.error(`Error enriching metadata for "${item.title}":`, error)
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
        return evaluator.evaluateCondition(condition, item, context)
      }
    }

    // If no specific field handler found, try any evaluator with condition support
    for (const evaluator of this.evaluators) {
      if (evaluator.evaluateCondition) {
        try {
          return evaluator.evaluateCondition(condition, item, context)
        } catch (e) {
          // Ignore errors, try the next evaluator
        }
      }
    }

    // Log warning if no evaluator could handle this field
    this.log.warn(`No evaluator found for condition field: ${field}`)
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
   * @param syncing - Whether this is part of a sync operation
   * @returns Promise resolving to array of instance IDs the item was routed to
   */
  private async routeUsingDefault(
    item: ContentItem,
    key: string,
    contentType: 'movie' | 'show',
    syncing?: boolean,
  ): Promise<number[]> {
    try {
      const routedInstances: number[] = []

      // Handle movies and shows differently since they use different managers
      if (contentType === 'movie') {
        // Step 1: Get the default Radarr instance
        const defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
        if (!defaultInstance) {
          this.log.warn('No default Radarr instance found for routing')
          return []
        }

        // Step 2: Route to the default instance
        try {
          await this.fastify.radarrManager.routeItemToRadarr(
            item as RadarrItem,
            key,
            defaultInstance.id,
            syncing,
          )
          routedInstances.push(defaultInstance.id)
        } catch (error) {
          this.log.error(
            `Error routing "${item.title}" to default Radarr instance ${defaultInstance.id}:`,
            error,
          )
        }

        // Step 3: Check for and route to synced instances
        // Parse the syncedInstances from the default instance (handling various formats)
        const syncedInstanceIds = Array.isArray(defaultInstance.syncedInstances)
          ? defaultInstance.syncedInstances
          : typeof defaultInstance.syncedInstances === 'string'
            ? (() => {
                try {
                  return JSON.parse(defaultInstance.syncedInstances || '[]')
                } catch (e) {
                  this.log.error(
                    `Invalid syncedInstances JSON for instance ${defaultInstance.id}:`,
                    e,
                  )
                  return []
                }
              })()
            : []

        // Only proceed if there are synced instances
        if (syncedInstanceIds.length > 0) {
          // Get all Radarr instances to look up details
          const allInstances = await this.fastify.db.getAllRadarrInstances()
          const instanceMap = new Map(
            allInstances.map((instance) => [instance.id, instance]),
          )

          // Process each synced instance
          for (const rawId of syncedInstanceIds) {
            const syncedId = Number(rawId)
            if (Number.isNaN(syncedId)) {
              this.log.warn(`Invalid synced instance ID "${rawId}" – skipping`)
              continue
            }

            // Skip if we've already routed to this instance
            if (routedInstances.includes(syncedId)) continue

            // Get the synced instance details
            const syncedInstance = instanceMap.get(syncedId)
            if (!syncedInstance) {
              this.log.warn(`Synced instance ${syncedId} not found – skipping`)
              continue
            }

            try {
              // Get the root folder for this instance (handling null case)
              const rootFolder =
                syncedInstance.rootFolder === null
                  ? undefined
                  : syncedInstance.rootFolder

              // Route to the synced instance with its specific settings
              await this.fastify.radarrManager.routeItemToRadarr(
                item as RadarrItem,
                key,
                syncedId,
                syncing,
                rootFolder,
                syncedInstance.qualityProfile,
                syncedInstance.tags,
                syncedInstance.searchOnAdd,
                syncedInstance.minimumAvailability,
              )
              routedInstances.push(syncedId)
            } catch (error) {
              this.log.error(
                `Error routing "${item.title}" to synced Radarr instance ${syncedId}:`,
                error,
              )
              // Continue with other synced instances even if one fails
            }
          }
        }
      } else {
        // TV shows - Similar implementation as movies but using Sonarr
        // Step 1: Get the default Sonarr instance
        const defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
        if (!defaultInstance) {
          this.log.warn('No default Sonarr instance found for routing')
          return []
        }

        // Step 2: Route to default instance
        try {
          await this.fastify.sonarrManager.routeItemToSonarr(
            item as SonarrItem,
            key,
            defaultInstance.id,
            syncing,
          )
          routedInstances.push(defaultInstance.id)
        } catch (error) {
          this.log.error(
            `Error routing "${item.title}" to default Sonarr instance ${defaultInstance.id}:`,
            error,
          )
        }

        // Step 3: Handle synced instances like with Radarr
        const syncedInstanceIds = Array.isArray(defaultInstance.syncedInstances)
          ? defaultInstance.syncedInstances
          : typeof defaultInstance.syncedInstances === 'string'
            ? (() => {
                try {
                  return JSON.parse(defaultInstance.syncedInstances || '[]')
                } catch (e) {
                  this.log.error(
                    `Invalid syncedInstances JSON for instance ${defaultInstance.id}:`,
                    e,
                  )
                  return []
                }
              })()
            : []

        if (syncedInstanceIds.length > 0) {
          const allInstances = await this.fastify.db.getAllSonarrInstances()
          const instanceMap = new Map(
            allInstances.map((instance) => [instance.id, instance]),
          )

          for (const rawId of syncedInstanceIds) {
            const syncedId = Number(rawId)
            if (Number.isNaN(syncedId)) {
              this.log.warn(`Invalid synced instance ID "${rawId}" – skipping`)
              continue
            }

            if (routedInstances.includes(syncedId)) continue

            const syncedInstance = instanceMap.get(syncedId)
            if (!syncedInstance) continue

            try {
              const rootFolder =
                syncedInstance.rootFolder === null
                  ? undefined
                  : syncedInstance.rootFolder

              await this.fastify.sonarrManager.routeItemToSonarr(
                item as SonarrItem,
                key,
                syncedId,
                syncing,
                rootFolder,
                syncedInstance.qualityProfile,
                syncedInstance.tags,
                syncedInstance.searchOnAdd,
                syncedInstance.seasonMonitoring,
              )
              routedInstances.push(syncedId)
            } catch (error) {
              this.log.error(
                `Error routing "${item.title}" to synced Sonarr instance ${syncedId}:`,
                error,
              )
            }
          }
        }
      }

      return routedInstances
    } catch (error) {
      this.log.error(`Error in default routing for ${item.title}:`, error)
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
}
