import { resolve, join, dirname } from 'node:path'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'

export class ContentRouterService {
  private plugins: RouterPlugin[] = []

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  async initialize(): Promise<void> {
    try {
      // Determine the router plugins directory path
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const projectRoot = resolve(__dirname, '..')
      const pluginsDir = join(projectRoot, 'router-plugins')

      this.log.info(`Loading router plugins from: ${pluginsDir}`)

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

              if (this.validatePlugin(plugin)) {
                this.plugins.push(plugin)
                this.log.info(`Loaded router plugin: ${plugin.name}`)
              } else {
                this.log.warn(
                  `Invalid plugin found: ${file}, missing required methods or properties`,
                )
              }
            } else {
              this.log.warn(`Plugin ${file} does not export a factory function`)
            }
          } catch (pluginError) {
            this.log.error(`Error loading plugin ${file}:`, pluginError)
          }
        }
      }

      // Sort plugins by their order property
      this.plugins.sort((a, b) => b.order - a.order)

      this.log.info(`Successfully loaded ${this.plugins.length} router plugins`)
    } catch (error) {
      this.log.error('Error initializing content router:', error)
      throw error
    }
  }

  private validatePlugin(plugin: RouterPlugin) {
    return (
      plugin &&
      typeof plugin.name === 'string' &&
      typeof plugin.description === 'string' &&
      typeof plugin.enabled === 'boolean' &&
      typeof plugin.order === 'number' &&
      typeof plugin.evaluateRouting === 'function'
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

    const context: RoutingContext = {
      userId: options.userId,
      userName: options.userName,
      itemKey: key,
      contentType,
      syncing: options.syncing,
      syncTargetInstanceId: options.syncTargetInstanceId,
    }

    // Collect all decisions from enabled plugins
    const allDecisions: RoutingDecision[] = []

    for (const plugin of this.plugins.filter((p) => p.enabled)) {
      try {
        const decisions = await plugin.evaluateRouting(item, context)

        if (decisions && decisions.length > 0) {
          this.log.debug(
            `Plugin "${plugin.name}" returned ${decisions.length} routing decisions for "${item.title}"`,
          )
          allDecisions.push(...decisions)
        }
      } catch (pluginError) {
        this.log.error(
          `Error in plugin "${plugin.name}" when routing "${item.title}":`,
          pluginError,
        )
      }
    }

    if (allDecisions.length === 0) {
      // If no routing decisions but we have a sync target, use it as fallback
      if (options.syncing && options.syncTargetInstanceId !== undefined) {
        this.log.info(
          `No routing decisions returned from any plugin for "${item.title}" during sync, using sync target instance ${options.syncTargetInstanceId}`,
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
          `No routing decisions returned from any plugin for "${item.title}", using default routing`,
        )
        await this.routeUsingDefault(item, key, contentType, options.syncing)
      }

      return { routedInstances }
    }

    // Sort decisions by weight for logging/tracking purposes
    allDecisions.sort((a, b) => b.weight - a.weight)

    // Track which instances we've already routed to for this item to avoid duplicates
    const processedInstanceIds = new Set<number>()
    let routeCount = 0

    // Execute ALL routing decisions, processing highest weight ones first
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
        `Routing "${item.title}" to instance ID ${decision.instanceId} with weight ${decision.weight}`,
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
        routeCount++
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
      `Successfully routed "${item.title}" to ${routeCount} instances`,
    )

    return { routedInstances }
  }

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

  getLoadedPlugins(): {
    name: string
    description: string
    enabled: boolean
    order: number
  }[] {
    return this.plugins.map((p) => ({
      name: p.name,
      description: p.description,
      enabled: p.enabled,
      order: p.order,
    }))
  }
}
