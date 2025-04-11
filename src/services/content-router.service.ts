/**
 * Content Router Service
 *
 * This service is responsible for routing content items to the appropriate
 * Radarr or Sonarr instances based on configurable rules.
 *
 * It implements a query builder pattern with pluggable predicate factories
 * that can be extended with custom predicate types.
 */
import { resolve, join, dirname } from 'node:path'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  PredicateFactoryPlugin,
  Predicate,
  ContentQuery,
  EnhancedContext,
  ContentMetadata,
  CompleteRouterRule,
} from '@root/types/router-query.types.js'
import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'
import { ContentQueryBuilder } from './content-query-builder.js'

/**
 * Content Router Service that implements the query builder pattern for routing
 * content to appropriate instances
 */
export class ContentRouterService {
  private predicateFactories = new Map<string, PredicateFactoryPlugin>()

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    // Load predicate factory plugins
    this.loadPredicateFactoryPlugins().catch((error) => {
      this.log.error('Error loading predicate factory plugins:', error)
    })
  }

  /**
   * Load and register all predicate factory plugins
   */
  private async loadPredicateFactoryPlugins(): Promise<void> {
    try {
      // Determine the predicate plugins directory path
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const projectRoot = resolve(__dirname, '..')
      const pluginsDir = join(projectRoot, 'predicate-plugins')

      this.log.info(`Loading predicate plugins from: ${pluginsDir}`)

      // Load all plugins from the directory
      const files = await readdir(pluginsDir)

      for (const file of files) {
        if (file.endsWith('.js')) {
          try {
            // Construct full path to plugin file
            const pluginPath = join(pluginsDir, file)

            // Use dynamic import to load the plugin module
            const pluginModule = await import(`file://${pluginPath}`)

            if (typeof pluginModule.default === 'function') {
              // It's a factory function, call it with fastify instance
              const plugin = pluginModule.default(this.fastify)

              if (this.validatePredicatePlugin(plugin)) {
                this.registerPredicateFactory(plugin)
                this.log.info(`Loaded predicate plugin: ${plugin.name}`)
              } else {
                this.log.warn(
                  `Invalid predicate plugin found: ${file}, missing required methods or properties`,
                )
              }
            } else {
              this.log.warn(`Plugin ${file} does not export a factory function`)
            }
          } catch (pluginError) {
            this.log.error(
              `Error loading predicate plugin ${file}:`,
              pluginError,
            )
          }
        }
      }

      this.log.info(
        `Successfully loaded ${this.predicateFactories.size} predicate factory plugins`,
      )
    } catch (error) {
      this.log.error('Error loading predicate factory plugins:', error)
      throw error
    }
  }

  /**
   * Validate that a predicate factory plugin meets required interface
   */
  private validatePredicatePlugin(
    plugin: any,
  ): plugin is PredicateFactoryPlugin {
    return (
      plugin &&
      typeof plugin.name === 'string' &&
      typeof plugin.displayName === 'string' &&
      typeof plugin.description === 'string' &&
      typeof plugin.createPredicate === 'function' &&
      typeof plugin.getSupportedOperators === 'function' &&
      typeof plugin.getValueType === 'function'
    )
  }

  /**
   * Register a predicate factory plugin
   */
  registerPredicateFactory(factory: PredicateFactoryPlugin): void {
    this.predicateFactories.set(factory.name, factory)
    this.log.info(`Registered predicate factory: ${factory.name}`)
  }

  /**
   * Get a predicate factory by name
   */
  getPredicateFactory<T = unknown>(
    name: string,
  ): PredicateFactoryPlugin<T> | undefined {
    return this.predicateFactories.get(name) as
      | PredicateFactoryPlugin<T>
      | undefined
  }

  /**
   * Get all registered predicate factories
   */
  getAllPredicateFactories(): PredicateFactoryPlugin[] {
    return Array.from(this.predicateFactories.values())
  }

  /**
   * Create a new query builder
   */
  createQuery(): ContentQuery {
    return new ContentQueryBuilder()
  }

  /**
   * Routes a content item according to router rules from the database
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
    const contentType = item.type.toLowerCase() as 'movie' | 'show'
    const routedInstances: number[] = []

    // Handle forced routing first if a specific instance ID is provided
    // but not if we're syncing with a target instance (to respect routing rules during sync)
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
        this.log.info(
          `Successfully force-routed "${item.title}" to instance ${options.forcedInstanceId}`,
        )
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

    // Create basic routing context
    const basicContext: RoutingContext = {
      userId: options.userId,
      userName: options.userName,
      itemKey: key,
      contentType,
      syncing: options.syncing,
      syncTargetInstanceId: options.syncTargetInstanceId,
    }

    try {
      // Fetch enhanced metadata for the item (once for all plugins)
      const metadata = await this.fetchContentMetadata(item, contentType)

      // Create enhanced context with metadata
      const context: EnhancedContext = {
        ...basicContext,
        metadata,
      }

      this.log.debug(
        `Enhanced routing context for "${item.title}": ${JSON.stringify({
          contentType,
          language: metadata.originalLanguage,
          year: metadata.releaseYear,
          userId: options.userId,
        })}`,
      )

      // Load all rules for this content type
      const rules = await this.loadRulesForContentType(contentType)

      this.log.debug(
        `Found ${rules.length} rules for content type ${contentType}`,
      )

      // Track which instances we've already processed
      const processedInstanceIds = new Set<number>()
      let routed = false

      // Process rules in priority order (highest weight first)
      for (const rule of rules) {
        try {
          // Skip disabled rules
          if (!rule.enabled) {
            continue
          }

          // Skip if we've already processed this instance
          if (processedInstanceIds.has(rule.target_instance_id)) {
            this.log.debug(
              `Skipping duplicate routing to instance ${rule.target_instance_id} for "${item.title}"`,
            )
            continue
          }

          // Build a query from the rule
          const query = await this.buildQueryFromRule(rule)
          if (!query) {
            this.log.warn(`Failed to build query for rule "${rule.name}"`)
            continue
          }

          // Execute the query
          const decisions = await query.execute(item, context)

          // If the query matched, route the item
          if (decisions && decisions.length > 0) {
            processedInstanceIds.add(rule.target_instance_id)

            this.log.info(
              `Routing "${item.title}" to instance ID ${rule.target_instance_id} based on rule "${rule.name}"`,
            )

            try {
              if (contentType === 'movie') {
                await this.fastify.radarrManager.routeItemToRadarr(
                  item as RadarrItem,
                  key,
                  rule.target_instance_id,
                  options.syncing,
                  rule.root_folder || undefined,
                  rule.quality_profile || undefined,
                )
              } else {
                await this.fastify.sonarrManager.routeItemToSonarr(
                  item as SonarrItem,
                  key,
                  rule.target_instance_id,
                  options.syncing,
                  rule.root_folder || undefined,
                  rule.quality_profile || undefined,
                )
              }

              routedInstances.push(rule.target_instance_id)
              routed = true
            } catch (routeError) {
              this.log.error(
                `Error routing "${item.title}" to instance ${rule.target_instance_id}:`,
                routeError,
              )
            }
          }
        } catch (ruleError) {
          this.log.error(`Error processing rule "${rule.name}":`, ruleError)
        }
      }

      // If no rules matched, handle fallback routing
      if (!routed) {
        // Special handling for sync operations
        if (options.syncing && options.syncTargetInstanceId !== undefined) {
          this.log.info(
            `No routing rules matched for "${item.title}" during sync, using sync target instance ${options.syncTargetInstanceId}`,
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
          // Fallback to default routing
          this.log.warn(
            `No routing rules matched for "${item.title}", using default routing`,
          )
          await this.routeUsingDefault(item, key, contentType, options.syncing)

          // Get the default instance that was used
          if (contentType === 'movie') {
            const defaultInstance =
              await this.fastify.db.getDefaultRadarrInstance()
            if (defaultInstance) {
              routedInstances.push(defaultInstance.id)
            }
          } else {
            const defaultInstance =
              await this.fastify.db.getDefaultSonarrInstance()
            if (defaultInstance) {
              routedInstances.push(defaultInstance.id)
            }
          }
        }
      }

      this.log.info(
        `Successfully routed "${item.title}" to ${routedInstances.length} instances`,
      )

      return { routedInstances }
    } catch (error) {
      this.log.error(`Error routing content "${item.title}":`, error)
      throw error
    }
  }

  /**
   * Fetch enhanced metadata for a content item
   * This consolidates all API calls into a single method
   */
  private async fetchContentMetadata(
    item: ContentItem,
    contentType: 'movie' | 'show',
  ): Promise<ContentMetadata> {
    const metadata: ContentMetadata = {}

    try {
      // Extract IDs from the content item's GUIDs
      if (Array.isArray(item.guids)) {
        for (const guid of item.guids) {
          if (guid.startsWith('tmdb:')) {
            metadata.tmdbId = Number(guid.replace('tmdb:', ''))
          } else if (guid.startsWith('imdb:')) {
            metadata.imdbId = guid.replace('imdb:', '')
          } else if (guid.startsWith('tvdb:')) {
            metadata.tvdbId = Number(guid.replace('tvdb:', ''))
          }
        }
      }

      // For movies, fetch from Radarr
      if (contentType === 'movie' && metadata.tmdbId) {
        try {
          const radarrService = this.fastify.radarrManager.getRadarrService(1)
          if (radarrService) {
            const movieResponse = await radarrService.getFromRadarr<
              RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
            >(`movie/lookup/tmdb?tmdbId=${metadata.tmdbId}`)

            // Store the raw data
            metadata.radarrData = movieResponse

            // Process the response based on its type
            let movieInfo: RadarrMovieLookupResponse | undefined

            if (Array.isArray(movieResponse) && movieResponse.length > 0) {
              movieInfo = movieResponse[0]
            } else if (!Array.isArray(movieResponse) && movieResponse) {
              movieInfo = movieResponse
            }

            // Extract useful fields if we have valid movie info
            if (movieInfo) {
              if (movieInfo.originalLanguage) {
                metadata.originalLanguage = movieInfo.originalLanguage.name
              }
              metadata.releaseYear = movieInfo.year
              metadata.certification = movieInfo.certification
              metadata.runtime = movieInfo.runtime
              metadata.studio = movieInfo.studio
              metadata.status = movieInfo.status
            }
          }
        } catch (error) {
          this.log.error(`Error fetching movie metadata from Radarr:`, error)
        }
      }

      // For TV shows, fetch from Sonarr
      else if (contentType === 'show' && metadata.tvdbId) {
        try {
          const sonarrService = this.fastify.sonarrManager.getSonarrService(1)
          if (sonarrService) {
            const showResponse = await sonarrService.getFromSonarr<
              SonarrSeriesLookupResponse | SonarrSeriesLookupResponse[]
            >(`series/lookup?term=tvdb:${metadata.tvdbId}`)

            // Store the raw data
            metadata.sonarrData = showResponse

            // Process the response based on its type
            let showInfo: SonarrSeriesLookupResponse | undefined

            if (Array.isArray(showResponse) && showResponse.length > 0) {
              showInfo = showResponse[0]
            } else if (!Array.isArray(showResponse) && showResponse) {
              showInfo = showResponse
            }

            // Extract useful fields if we have valid show info
            if (showInfo) {
              if (showInfo.originalLanguage) {
                metadata.originalLanguage = showInfo.originalLanguage.name
              }
              metadata.releaseYear = showInfo.year
              metadata.network = showInfo.network
              metadata.status = showInfo.status
              metadata.ended = showInfo.ended
              metadata.runtime = showInfo.runtime
            }
          }
        } catch (error) {
          this.log.error(`Error fetching show metadata from Sonarr:`, error)
        }
      }

      return metadata
    } catch (error) {
      this.log.error(`Error fetching content metadata:`, error)
      return metadata // Return whatever we have
    }
  }

  /**
   * Load rules from the database for a specific content type
   */
  private async loadRulesForContentType(
    contentType: 'movie' | 'show',
  ): Promise<CompleteRouterRule[]> {
    const targetType = contentType === 'movie' ? 'radarr' : 'sonarr'
    return await this.fastify.db.getRulesByTargetType(targetType)
  }

  /**
   * Build a ContentQuery from a router rule
   */
  private async buildQueryFromRule(
    rule: CompleteRouterRule,
  ): Promise<ContentQuery | null> {
    try {
      // Create a new query
      const query = this.createQuery()

      // Set the routing target
      query.routeTo({
        instanceId: rule.target_instance_id,
        qualityProfile: rule.quality_profile,
        rootFolder: rule.root_folder,
        weight: rule.order || 50,
      })

      // If this is a legacy rule, return null
      if (rule.query_type === 'legacy') {
        this.log.debug(
          `Rule "${rule.name}" is a legacy rule, skipping query building`,
        )
        return null
      }

      // Get all conditions for this rule
      const conditions = rule.conditions || []

      // If there are no conditions, return the query as-is (will always match)
      if (conditions.length === 0) {
        return query
      }

      // Build condition groups
      const groupMap = new Map<
        number,
        { conditions: any[]; operator: 'AND' | 'OR' | 'NOT' }
      >()

      // First pass: create all groups
      for (const condition of conditions) {
        if (condition.predicate_type === 'group') {
          groupMap.set(condition.id, {
            conditions: [],
            operator:
              (condition.group_operator as 'AND' | 'OR' | 'NOT') || 'AND',
          })
        }
      }

      // Second pass: assign conditions to groups
      for (const condition of conditions) {
        if (condition.predicate_type !== 'group' && condition.group_id) {
          const group = groupMap.get(condition.group_id)
          if (group) {
            group.conditions.push(condition)
          }
        }
      }

      // Build the query based on the groups and conditions
      // Start with the root group
      const rootGroups = conditions.filter(
        (c) => c.predicate_type === 'group' && !c.parent_group_id,
      )

      // If no root groups, add all conditions directly to the query
      if (rootGroups.length === 0) {
        this.log.debug(
          `Rule "${rule.name}" has no root groups, adding conditions directly`,
        )

        // Get all conditions without a group
        const ungroupedConditions = conditions.filter(
          (c) => c.predicate_type !== 'group' && !c.group_id,
        )

        // Add each condition directly to the query
        for (const condition of ungroupedConditions) {
          await this.addConditionToQuery(query, condition)
        }

        return query
      }

      // Process each root group
      for (const rootGroup of rootGroups) {
        const group = groupMap.get(rootGroup.id)
        if (!group) continue

        // Sort the conditions by order_index
        const groupConditions = group.conditions.sort(
          (a, b) => (a.order_index || 0) - (b.order_index || 0),
        )

        // Different handling based on group operator
        if (group.operator === 'AND') {
          // Add each condition directly to the query (implicit AND)
          for (const condition of groupConditions) {
            await this.addConditionToQuery(query, condition)
          }
        } else if (group.operator === 'OR') {
          // Create an OR group
          query.or((orQuery) => {
            for (const condition of groupConditions) {
              this.addConditionToQuery(orQuery, condition).catch((error) => {
                this.log.error(`Error adding condition to OR group:`, error)
              })
            }
          })
        } else if (group.operator === 'NOT') {
          // For NOT, we add the first condition with whereNot
          if (groupConditions.length > 0) {
            const condition = groupConditions[0]
            const predicate = await this.createPredicateFromCondition(condition)
            if (predicate) {
              query.whereNot(predicate)
            }
          }
        }
      }

      return query
    } catch (error) {
      this.log.error(`Error building query from rule "${rule.name}":`, error)
      return null
    }
  }

  /**
   * Add a condition to a query
   */
  private async addConditionToQuery(
    query: ContentQuery,
    condition: any,
  ): Promise<void> {
    const predicate = await this.createPredicateFromCondition(condition)
    if (predicate) {
      query.where(predicate)
    }
  }

  /**
   * Create a predicate from a condition
   */
  private async createPredicateFromCondition(
    condition: any,
  ): Promise<Predicate | null> {
    try {
      // Get the predicate factory
      const factory = this.getPredicateFactory(condition.predicate_type)
      if (!factory) {
        this.log.warn(
          `No predicate factory found for type "${condition.predicate_type}"`,
        )
        return null
      }

      // Parse the value
      let value
      try {
        value = JSON.parse(condition.value)
      } catch (e) {
        // If parsing fails, use the raw value
        value = condition.value
      }

      // Create the predicate
      const predicate = factory.createPredicate(value)

      // For operators that invert the result, wrap the predicate
      if (condition.operator && condition.operator.startsWith('NOT_')) {
        return async (item, context) => {
          const result = await predicate(item, context)
          return !result
        }
      }

      return predicate
    } catch (error) {
      this.log.error(`Error creating predicate from condition:`, error)
      return null
    }
  }

  /**
   * Routes content using the default instance
   */
  private async routeUsingDefault(
    item: ContentItem,
    key: string,
    contentType: 'movie' | 'show',
    syncing?: boolean,
  ): Promise<void> {
    if (contentType === 'movie') {
      await this.fastify.radarrManager.routeItemToRadarr(
        item as RadarrItem,
        key,
        undefined,
        syncing,
      )
    } else {
      await this.fastify.sonarrManager.routeItemToSonarr(
        item as SonarrItem,
        key,
        undefined,
        syncing,
      )
    }
  }

  /**
   * Example of how to create a complex query programmatically
   */
  buildComplexQuery(options: {
    language?: string
    yearBefore?: number
    excludedGenres?: string[]
    user?: { id?: number; name?: string }
    certification?: string
    runtime?: { min?: number; max?: number }
  }): ContentQuery {
    const query = this.createQuery()

    // Language predicate (if specified)
    if (options.language) {
      const languageFactory = this.getPredicateFactory<string>('language')
      if (languageFactory) {
        query.where(languageFactory.createPredicate(options.language))
      }
    }

    // Year predicate (if specified)
    if (options.yearBefore) {
      const yearFactory = this.getPredicateFactory<{ max: number }>('year')
      if (yearFactory) {
        query.where(yearFactory.createPredicate({ max: options.yearBefore }))
      }
    }

    // Excluded genres (if specified)
    if (options.excludedGenres && options.excludedGenres.length > 0) {
      const genreFactory = this.getPredicateFactory<string>('genre')
      if (genreFactory) {
        // Create NOT predicates for each excluded genre
        options.excludedGenres.forEach((genre) => {
          query.whereNot(genreFactory.createPredicate(genre))
        })
      }
    }

    // User predicates (if specified)
    if (options.user) {
      const userFactory = this.getPredicateFactory<{
        ids?: number
        names?: string
      }>('user')
      if (userFactory) {
        const userCriteria: { ids?: number; names?: string } = {}

        if (options.user.id) {
          userCriteria.ids = options.user.id
        }

        if (options.user.name) {
          userCriteria.names = options.user.name
        }

        if (Object.keys(userCriteria).length > 0) {
          query.where(userFactory.createPredicate(userCriteria))
        }
      }
    }

    // Certification predicate (if specified)
    if (options.certification) {
      const certificationFactory =
        this.getPredicateFactory<string>('certification')
      if (certificationFactory) {
        query.where(certificationFactory.createPredicate(options.certification))
      }
    }

    // Runtime predicate (if specified)
    if (options.runtime) {
      const runtimeFactory = this.getPredicateFactory<{
        min?: number
        max?: number
      }>('runtime')
      if (runtimeFactory) {
        query.where(runtimeFactory.createPredicate(options.runtime))
      }
    }

    return query
  }

  /**
   * Get list of all loaded predicate plugins
   */
  getLoadedPredicatePlugins(): {
    name: string
    displayName: string
    description: string
    supportedOperators: string[]
    valueType: string
  }[] {
    return Array.from(this.predicateFactories.values()).map((factory) => ({
      name: factory.name,
      displayName: factory.displayName,
      description: factory.description,
      supportedOperators: factory.getSupportedOperators(),
      valueType: factory.getValueType(),
    }))
  }
}
