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
    } = {},
  ): Promise<void> {
    const contentType = item.type.toLowerCase() as 'movie' | 'show'

    this.log.info(`Routing ${contentType} "${item.title}" using plugin system`)

    const context: RoutingContext = {
      userId: options.userId,
      userName: options.userName,
      itemKey: key,
      contentType,
      syncing: options.syncing,
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
      this.log.warn(
        `No routing decisions returned from any plugin for "${item.title}", using default routing`,
      )
      await this.routeUsingDefault(item, key, contentType, options.syncing)
      return
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
      } catch (routeError) {
        this.log.error(
          `Error routing "${item.title}" to instance ${decision.instanceId}:`,
          routeError,
        )
      }
    }

    this.log.info(
      `Successfully routed "${item.title}" to ${routeCount} instances`,
    )
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
