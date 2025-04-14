import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  ConditionGroup,
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

export class ContentRouterService {
  private evaluators: RoutingEvaluator[] = []

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

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
            const evaluatorPath = join(evaluatorsDir, file)
            const evaluatorModule = await import(`file://${evaluatorPath}`)

            if (typeof evaluatorModule.default === 'function') {
              const evaluator = evaluatorModule.default(this.fastify)

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

      // Sort evaluators by priority (highest first)
      this.evaluators.sort((a, b) => b.priority - a.priority)

      this.log.info(
        `Successfully loaded ${this.evaluators.length} router evaluators`,
      )
    } catch (error) {
      this.log.error('Error initializing content router:', error)
      throw error
    }
  }

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
    const contentType = item.type.toLowerCase() as 'movie' | 'show'
    const routedInstances: number[] = []

    // Handle forced routing first if specified
    if (
      options.forcedInstanceId !== undefined &&
      !(options.syncing && options.syncTargetInstanceId !== undefined)
    ) {
      this.log.info(
        `Forced routing of "${item.title}" to instance ID ${options.forcedInstanceId}`,
      )

      try {
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

    const context: RoutingContext = {
      userId: options.userId,
      userName: options.userName,
      itemKey: key,
      contentType,
      syncing: options.syncing,
      syncTargetInstanceId: options.syncTargetInstanceId,
    }

    // First, enrich the item with metadata if needed
    const enrichedItem = await this.enrichItemMetadata(item, context)

    // Now evaluate all applicable routing evaluators with the enriched item
    const allDecisions: RoutingDecision[] = []
    const processedInstanceIds = new Set<number>()

    for (const evaluator of this.evaluators) {
      try {
        // Check if this evaluator applies to this content
        const canEvaluate = await evaluator.canEvaluate(enrichedItem, context)
        if (!canEvaluate) continue

        // Get routing decisions from this evaluator
        const decisions = await evaluator.evaluate(enrichedItem, context)
        if (decisions && decisions.length > 0) {
          this.log.debug(
            `Evaluator "${evaluator.name}" returned ${decisions.length} routing decisions for "${item.title}"`,
          )
          allDecisions.push(...decisions)
        }
      } catch (evaluatorError) {
        this.log.error(
          `Error in evaluator "${evaluator.name}" when routing "${item.title}":`,
          evaluatorError,
        )
      }
    }

    if (allDecisions.length === 0) {
      // If no routing decisions but we have a sync target, use it as fallback
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
      } else {
        // Fall back to default routing for non-sync operations
        this.log.warn(
          `No routing decisions returned for "${item.title}", using default routing`,
        )
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

    // Sort decisions by priority (highest first)
    allDecisions.sort((a, b) => b.priority - a.priority)

    // Execute all routing decisions, processing highest priority ones first
    for (const decision of allDecisions) {
      // Skip if we've already routed to this instance
      if (processedInstanceIds.has(decision.instanceId)) {
        this.log.debug(
          `Skipping duplicate routing to instance ${decision.instanceId} for "${item.title}"`,
        )
        continue
      }

      processedInstanceIds.add(decision.instanceId)

      this.log.info(
        `Routing "${item.title}" to instance ID ${decision.instanceId} with priority ${decision.priority}`,
      )

      try {
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
          )
        }
        routedInstances.push(decision.instanceId)
      } catch (routeError) {
        this.log.error(
          `Error routing "${item.title}" to instance ${decision.instanceId}:`,
          routeError,
        )
      }
    }

    // Special handling for sync operations where target instance wasn't in the routing decisions
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
      `Successfully routed "${item.title}" to ${routedInstances.length} instances`,
    )

    return { routedInstances }
  }

  /**
   * Enriches a content item with full metadata by making API calls
   * This happens once per routing operation to avoid duplicate API calls
   */
  private async enrichItemMetadata(
    item: ContentItem,
    context: RoutingContext,
  ): Promise<ContentItem> {
    const isMovie = context.contentType === 'movie'

    // Skip if we can't extract an ID
    if (!Array.isArray(item.guids) || item.guids.length === 0) {
      return item
    }

    // Extract ID from guids
    let itemId: number | undefined

    if (isMovie) {
      const tmdbGuid = item.guids.find((guid) => guid.startsWith('tmdb:'))
      if (tmdbGuid) {
        itemId = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
      }
    } else {
      const tvdbGuid = item.guids.find((guid) => guid.startsWith('tvdb:'))
      if (tvdbGuid) {
        itemId = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
      }
    }

    if (!itemId || Number.isNaN(itemId)) {
      this.log.debug(
        `Couldn't extract ID from item "${item.title}", skipping metadata enrichment`,
      )
      return item
    }

    try {
      // Fetch full metadata from API
      if (isMovie) {
        const lookupService = this.fastify.radarrManager.getRadarrService(1)
        if (!lookupService) {
          this.log.warn('No Radarr service available for metadata lookup')
          return item
        }

        const apiResponse = await lookupService.getFromRadarr<
          RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
        >(`movie/lookup/tmdb?tmdbId=${itemId}`)

        let movieMetadata: RadarrMovieLookupResponse | undefined

        if (Array.isArray(apiResponse) && apiResponse.length > 0) {
          movieMetadata = apiResponse[0]
        } else if (!Array.isArray(apiResponse)) {
          movieMetadata = apiResponse
        }

        if (movieMetadata) {
          return {
            ...item,
            metadata: movieMetadata,
          }
        }
      } else {
        const lookupService = this.fastify.sonarrManager.getSonarrService(1)
        if (!lookupService) {
          this.log.warn('No Sonarr service available for metadata lookup')
          return item
        }

        const apiResponse = await lookupService.getFromSonarr<
          SonarrSeriesLookupResponse | SonarrSeriesLookupResponse[]
        >(`series/lookup?term=tvdb:${itemId}`)

        let seriesMetadata: SonarrSeriesLookupResponse | undefined

        if (Array.isArray(apiResponse) && apiResponse.length > 0) {
          seriesMetadata = apiResponse[0]
        } else if (!Array.isArray(apiResponse)) {
          seriesMetadata = apiResponse
        }

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

    return item
  }

  /**
   * Evaluates a condition against a content item
   * This delegates to the appropriate evaluator based on the condition field
   */
  evaluateCondition(
    condition: Condition | ConditionGroup,
    item: ContentItem,
    context: RoutingContext,
  ): boolean {
    // Handle negation wrapper
    const result = this._evaluateCondition(condition, item, context)
    return condition.negate ? !result : result
  }

  private _evaluateCondition(
    condition: Condition | ConditionGroup,
    item: ContentItem,
    context: RoutingContext,
  ): boolean {
    // Handle group condition - evaluate nested conditions with logical operator
    if ('conditions' in condition) {
      return this.evaluateGroupCondition(condition, item, context)
    }

    // For single conditions, find an evaluator that can handle this field
    const { field } = condition as Condition

    // Try to find an evaluator that explicitly handles this field
    for (const evaluator of this.evaluators) {
      if (
        evaluator.evaluateCondition &&
        evaluator.canEvaluateConditionField &&
        evaluator.canEvaluateConditionField(field)
      ) {
        return evaluator.evaluateCondition(condition, item, context)
      }
    }

    // If no specific handler, try any evaluator with condition support
    for (const evaluator of this.evaluators) {
      if (evaluator.evaluateCondition) {
        try {
          return evaluator.evaluateCondition(condition, item, context)
        } catch (e) {
          // Ignore errors, try the next evaluator
        }
      }
    }

    this.log.warn(`No evaluator found for condition field: ${field}`)
    return false
  }

  /**
   * Evaluates a group condition with logical operators
   */
  private evaluateGroupCondition(
    group: ConditionGroup,
    item: ContentItem,
    context: RoutingContext,
  ): boolean {
    if (!group.conditions || group.conditions.length === 0) {
      return false
    }

    if (group.operator === 'AND') {
      // All conditions must be true
      for (const condition of group.conditions) {
        if (!this.evaluateCondition(condition, item, context)) {
          return false
        }
      }
      return true
    }

    // OR - at least one condition must be true
    for (const condition of group.conditions) {
      if (this.evaluateCondition(condition, item, context)) {
        return true
      }
    }
    return false
  }

  // Default routing method - similar to your existing implementation
  private async routeUsingDefault(
    item: ContentItem,
    key: string,
    contentType: 'movie' | 'show',
    syncing?: boolean,
  ): Promise<number[]> {
    try {
      const routedInstances: number[] = []

      if (contentType === 'movie') {
        // Get default Radarr instance
        const defaultInstance = await this.fastify.db.getDefaultRadarrInstance()
        if (!defaultInstance) {
          this.log.warn('No default Radarr instance found for routing')
          return []
        }

        // Route to default instance
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

        // Handle synced instances
        const syncedInstanceIds = Array.isArray(defaultInstance.syncedInstances)
          ? defaultInstance.syncedInstances
          : typeof defaultInstance.syncedInstances === 'string'
            ? JSON.parse(defaultInstance.syncedInstances || '[]')
            : []

        if (syncedInstanceIds.length > 0) {
          const allInstances = await this.fastify.db.getAllRadarrInstances()
          const instanceMap = new Map(
            allInstances.map((instance) => [instance.id, instance]),
          )

          for (const syncedId of syncedInstanceIds) {
            if (routedInstances.includes(syncedId)) continue

            const syncedInstance = instanceMap.get(syncedId)
            if (!syncedInstance) continue

            try {
              const rootFolder =
                syncedInstance.rootFolder === null
                  ? undefined
                  : syncedInstance.rootFolder

              await this.fastify.radarrManager.routeItemToRadarr(
                item as RadarrItem,
                key,
                syncedId,
                syncing,
                rootFolder,
                syncedInstance.qualityProfile,
              )
              routedInstances.push(syncedId)
            } catch (error) {
              this.log.error(
                `Error routing "${item.title}" to synced Radarr instance ${syncedId}:`,
                error,
              )
            }
          }
        }
      } else {
        // Similar implementation for Sonarr
        const defaultInstance = await this.fastify.db.getDefaultSonarrInstance()
        if (!defaultInstance) {
          this.log.warn('No default Sonarr instance found for routing')
          return []
        }

        // Route to default instance
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

        // Handle synced instances
        const syncedInstanceIds = Array.isArray(defaultInstance.syncedInstances)
          ? defaultInstance.syncedInstances
          : typeof defaultInstance.syncedInstances === 'string'
            ? JSON.parse(defaultInstance.syncedInstances || '[]')
            : []

        if (syncedInstanceIds.length > 0) {
          const allInstances = await this.fastify.db.getAllSonarrInstances()
          const instanceMap = new Map(
            allInstances.map((instance) => [instance.id, instance]),
          )

          for (const syncedId of syncedInstanceIds) {
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
}
