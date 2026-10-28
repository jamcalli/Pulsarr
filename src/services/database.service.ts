import { DefaultInstanceError } from '@root/types/errors.js'
import { createServiceLogger } from '@utils/logger.js'
import { configurePgTypes } from '@utils/postgres-config.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import knex, { type Knex } from 'knex'
import * as analyticsMethods from './database/methods/analytics.js'
import * as animeMethods from './database/methods/anime.js'
import * as apiKeyMethods from './database/methods/api-keys.js'
import * as approvalMethods from './database/methods/approval.js'
import * as configMethods from './database/methods/config.js'
import * as dashboardMethods from './database/methods/dashboard.js'
import * as junctionMethods from './database/methods/junction.js'
import * as notificationMethods from './database/methods/notification.js'
import * as plexLabelSyncMethods from './database/methods/plex-label-sync.js'
import * as plexLabelTrackingMethods from './database/methods/plex-label-tracking.js'
import * as quotaMethods from './database/methods/quota.js'
import * as radarrInstanceMethods from './database/methods/radarr-instance.js'
import * as routerMethods from './database/methods/router.js'
import * as schedulerMethods from './database/methods/schedule.js'
import * as sessionMethods from './database/methods/session.js'
import * as sonarrInstanceMethods from './database/methods/sonarr-instance.js'
import * as userMethods from './database/methods/users.js'
import * as watchlistMethods from './database/methods/watchlist.js'
import * as watchlistExclusionMethods from './database/methods/watchlist-exclusion.js'
import * as webhookMethods from './database/methods/webhook.js'
import * as webhookEndpointMethods from './database/methods/webhook-endpoints.js'

type Methods<M> = {
  [K in keyof M as ThisParameterType<M[K]> extends object
    ? K
    : never]: OmitThisParameter<M[K]>
}

// Every exported function taking `this: DatabaseService` in a module bound by bindMethods becomes a method.
export interface DatabaseService
  extends Methods<typeof analyticsMethods>,
    Methods<typeof animeMethods>,
    Methods<typeof apiKeyMethods>,
    Methods<typeof approvalMethods>,
    Methods<typeof configMethods>,
    Methods<typeof dashboardMethods>,
    Methods<typeof junctionMethods>,
    Methods<typeof notificationMethods>,
    Methods<typeof plexLabelSyncMethods>,
    Methods<typeof plexLabelTrackingMethods>,
    Methods<typeof quotaMethods>,
    Methods<typeof radarrInstanceMethods>,
    Methods<typeof routerMethods>,
    Methods<typeof schedulerMethods>,
    Methods<typeof sessionMethods>,
    Methods<typeof sonarrInstanceMethods>,
    Methods<typeof userMethods>,
    Methods<typeof watchlistMethods>,
    Methods<typeof watchlistExclusionMethods>,
    Methods<typeof webhookMethods>,
    Methods<typeof webhookEndpointMethods> {}

export class DatabaseService {
  public readonly knex: Knex

  /**
   * Flag indicating whether we're using PostgreSQL (true) or SQLite (false)
   */
  public readonly isPostgres: boolean

  /**
   * Service logger that inherits parent log level changes
   */
  public readonly log: FastifyBaseLogger

  /**
   * Creates a new DatabaseService instance
   *
   * @param log - Fastify logger instance for recording database operations
   * @param fastify - Fastify instance containing configuration and context
   */
  constructor(
    public readonly baseLog: FastifyBaseLogger,
    public readonly fastify: FastifyInstance,
    testKnex?: Knex,
  ) {
    this.log = createServiceLogger(baseLog, 'DATABASE')
    this.isPostgres = fastify.config.dbType === 'postgres'
    this.knex =
      testKnex ??
      knex(DatabaseService.createKnexConfig(fastify.config, this.log))

    // Bind all modular database methods to this instance
    this.bindMethods()
  }

  /**
   * Provides access to the Fastify configuration
   */
  public get config() {
    return this.fastify.config
  }

  //=============================================================================
  // DATABASE CONNECTION AND LIFECYCLE
  //=============================================================================

  /**
   * Factory method to create a properly initialized DatabaseService
   *
   * This method handles database-specific setup like PostgreSQL type configuration
   * that needs to happen after construction but before the service is used.
   */
  static async create(
    log: FastifyBaseLogger,
    fastify: FastifyInstance,
    testKnex?: Knex,
  ): Promise<DatabaseService> {
    const service = new DatabaseService(log, fastify, testKnex)

    // Configure PostgreSQL type parsers if needed
    if (fastify.config.dbType === 'postgres') {
      await service.configurePostgresTypes()
    }

    return service
  }

  /**
   * Configures PostgreSQL type parsers asynchronously
   */
  public async configurePostgresTypes(): Promise<void> {
    try {
      await configurePgTypes(this.log)
      this.log.debug('PostgreSQL type parsers configured successfully')
    } catch (error) {
      this.log.error({ error }, 'Failed to configure PostgreSQL type parsers:')
      // Consider if this should be fatal or if the app can continue
      // with default type parsing
    }
  }

  /**
   * Closes the database connection
   *
   * Should be called during application shutdown to properly clean up resources.
   */
  async close(): Promise<void> {
    await this.knex.destroy()
  }

  //=============================================================================
  // DATABASE UTILITY HELPERS
  //=============================================================================

  /**
   * Binds all modular database methods to this service instance
   *
   * This method dynamically attaches methods from separate module files to this
   * DatabaseService instance, allowing them to be called as native class methods.
   * Each method is bound with the correct 'this' context so they can access
   * the service's knex instance, logger, and other properties.
   */
  private bindMethods(): void {
    const methodModules = [
      analyticsMethods,
      animeMethods,
      apiKeyMethods,
      approvalMethods,
      configMethods,
      dashboardMethods,
      watchlistExclusionMethods,
      junctionMethods,
      notificationMethods,
      plexLabelSyncMethods,
      plexLabelTrackingMethods,
      quotaMethods,
      radarrInstanceMethods,
      routerMethods,
      schedulerMethods,
      sessionMethods,
      sonarrInstanceMethods,
      userMethods,
      watchlistMethods,
      webhookEndpointMethods,
      webhookMethods,
    ]

    const bound = new Set<string>()
    for (const module of methodModules) {
      for (const [methodName, methodFunction] of Object.entries(module)) {
        if (methodName === 'default' || typeof methodFunction !== 'function') {
          continue
        }
        if (bound.has(methodName)) {
          this.log.warn(
            `Overwriting database method '${methodName}' from a later module`,
          )
        }
        // Bind each method to this DatabaseService instance
        ;(this as Record<string, unknown>)[methodName] =
          methodFunction.bind(this)
        bound.add(methodName)
      }
    }
  }

  /**
   * Helper method to extract rows from raw query results
   * PostgreSQL returns {rows: T[]} while SQLite returns T[] directly
   */
  public extractRawQueryRows<T>(result: T[] | { rows: T[] }): T[] {
    if (Array.isArray(result)) {
      return result
    }
    if (
      result &&
      typeof result === 'object' &&
      'rows' in result &&
      Array.isArray(result.rows)
    ) {
      return result.rows
    }
    this.log.error(
      {
        result,
        resultType: typeof result,
        isArray: Array.isArray(result),
        hasRows: result && typeof result === 'object' && 'rows' in result,
      },
      'Unexpected raw query result format',
    )
    throw new Error('Invalid database query result format')
  }

  /**
   * Creates Knex configuration for SQLite or PostgreSQL
   *
   * Sets up connection pooling, logging, and other database-specific configurations.
   *
   * @param config - Application configuration containing database settings
   * @param log - Logger to use for database operations
   * @returns Knex configuration object
   */
  public static createKnexConfig(
    config: FastifyInstance['config'],
    log: FastifyBaseLogger,
  ): Knex.Config {
    const isPostgres = config.dbType === 'postgres'

    // Build PostgreSQL connection
    const getPostgresConnection = () => {
      if (config.dbConnectionString) {
        return config.dbConnectionString
      }

      return {
        host: config.dbHost,
        port: config.dbPort,
        user: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
      }
    }

    return {
      client: isPostgres ? 'pg' : 'better-sqlite3',
      connection: isPostgres
        ? getPostgresConnection()
        : {
            filename: config.dbPath,
          },
      useNullAsDefault: !isPostgres,
      pool: isPostgres
        ? {
            min: 2,
            max: 10,
          }
        : {
            min: 1,
            max: 1,
            afterCreate: (
              conn: { exec: (sql: string) => void },
              done: (err: Error | null, conn: unknown) => void,
            ) => {
              // SQLite-specific optimizations
              conn.exec('PRAGMA journal_mode = WAL;')
              conn.exec('PRAGMA foreign_keys = ON;')
              done(null, conn)
            },
          },
      log: {
        warn: (message: string) => log.warn(message),
        error: (message: string | Error) => {
          log.error(message instanceof Error ? message.message : message)
        },
        debug: (message: string) => log.debug(message),
      },
      debug: false,
    }
  }

  /**
   * Safely parse JSON strings with error logging
   *
   * @param value - JSON string to parse
   * @param defaultValue - Default value to return on parse failure
   * @param context - Context string for logging (e.g., 'watchlist_item.guids')
   * @returns Parsed value or default value
   */
  public safeJsonParse<T>(
    value: string | null | undefined,
    defaultValue: T,
    context?: string,
  ): T {
    if (!value) return defaultValue
    try {
      return JSON.parse(value)
    } catch (error) {
      this.log.warn({ value, context, error }, 'JSON parse error')
      return defaultValue
    }
  }

  /**
   * Generate database-specific date difference calculation SQL
   *
   * @param date1 - First date expression (minuend)
   * @param date2 - Second date expression (subtrahend)
   * @param alias - Optional alias for the result
   * @returns SQL expression for date difference in days
   */
  public getDateDiffSQL(date1: string, date2: string, alias?: string): string {
    const diff = this.isPostgres
      ? `EXTRACT(EPOCH FROM (${date1} - ${date2})) / 86400`
      : `julianday(${date1}) - julianday(${date2})`

    return alias ? `${diff} AS ${alias}` : diff
  }

  /**
   * Runs a callback inside a database transaction.
   *
   * Provides a transaction object that can be passed to db methods accepting
   * an optional `trx` parameter. If the callback throws, the transaction is
   * rolled back automatically.
   *
   * @param fn - Callback receiving the Knex transaction
   * @returns The value returned by the callback
   */
  public async transaction<T>(
    fn: (trx: Knex.Transaction) => Promise<T>,
  ): Promise<T> {
    return this.knex.transaction(fn)
  }

  /**
   * Returns the current timestamp in ISO format
   */
  public get timestamp() {
    return new Date().toISOString()
  }

  /**
   * Extracts ID from Knex returning() result, handling cross-dialect differences
   *
   * Knex returning() returns different formats depending on the database:
   * - PostgreSQL: [{ id: 123 }] (array of objects)
   * - SQLite: [123] (array of values)
   *
   * @param result - Result from knex insert(...).returning('id')
   * @returns The extracted ID value
   */
  public extractId(result: unknown[]): number {
    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error('No ID returned from database')
    }

    const firstResult = result[0]

    if (
      typeof firstResult === 'object' &&
      firstResult !== null &&
      'id' in firstResult
    ) {
      // PostgreSQL format: { id: 123 }
      return (firstResult as { id: number }).id
    }

    if (typeof firstResult === 'number') {
      // SQLite format: 123
      return firstResult
    }

    throw new Error('Invalid ID format returned from database')
  }

  //=============================================================================
  // BUSINESS LOGIC HELPERS
  //=============================================================================

  /**
   * Validates whether an instance can have its default status changed
   * Shared helper for both Radarr and Sonarr instances to eliminate duplicated logic
   *
   * @param trx - Knex transaction object
   * @param tableName - Table name (radarr_instances or sonarr_instances)
   * @param instanceId - ID of the instance being updated
   * @param newDefaultStatus - New default status value (true/false)
   * @param serviceName - Service name for error messages (Radarr/Sonarr)
   * @throws Error if default status cannot be changed
   */
  public async validateInstanceDefaultStatus(
    trx: Knex.Transaction,
    tableName: 'radarr_instances' | 'sonarr_instances',
    instanceId: number,
    newDefaultStatus: boolean | undefined,
    serviceName: 'Radarr' | 'Sonarr',
  ): Promise<void> {
    // Determine what the desired default instance will be after this operation
    let desiredDefaultId: number | null = null

    if (newDefaultStatus === true) {
      // This instance will be the default after the operation
      desiredDefaultId = instanceId
    } else if (newDefaultStatus === false) {
      // Get the current instance to see if it's default now
      const currentInstance = await trx(tableName)
        .where('id', instanceId)
        .first()

      // Only check further if this instance is currently default and being unset
      if (currentInstance?.is_default) {
        // Look for any other enabled instance that could become default
        const otherInstance = await trx(tableName)
          .where('is_enabled', true)
          .whereNot('id', instanceId)
          .orderBy('id')
          .first('id')

        if (otherInstance) {
          desiredDefaultId = otherInstance.id
        }
        // Else no default will exist after this operation
      } else {
        // This instance isn't currently default, so find current default
        const currentDefault = await trx(tableName)
          .where('is_default', true)
          .first('id')

        if (currentDefault) {
          desiredDefaultId = currentDefault.id
        }
      }
    } else {
      // No change to default status requested, find current default
      const currentDefault = await trx(tableName)
        .where('is_default', true)
        .first('id')

      if (currentDefault?.id === instanceId) {
        // This instance is already default
        desiredDefaultId = instanceId
      } else if (currentDefault) {
        // Another instance is default
        desiredDefaultId = currentDefault.id
      }
    }

    // If trying to set instance as non-default, we need to check if it's allowed
    if (newDefaultStatus === false) {
      const currentInstance = await trx(tableName)
        .where('id', instanceId)
        .first()

      // Only need additional checks if this instance is currently default
      if (currentInstance?.is_default) {
        // Check if this is the only instance
        const totalInstancesCount = await trx(tableName)
          .count({ count: '*' })
          .first()

        const totalCount = totalInstancesCount?.count
          ? Number(totalInstancesCount.count)
          : 0

        // If there's only one instance total, it must be default
        if (totalCount <= 1) {
          this.log.warn(
            `Cannot remove default status from the only ${serviceName} instance`,
          )
          throw new Error(
            `Cannot remove default status from the only ${serviceName} instance`,
          )
        }

        // If this is the only real instance (not placeholder), it must be default
        const realInstancesCount = await trx(tableName)
          .where('is_enabled', true)
          .whereNot('api_key', 'placeholder')
          .count({ count: '*' })
          .first()

        const realCount = realInstancesCount?.count
          ? Number(realInstancesCount.count)
          : 0

        if (currentInstance.api_key !== 'placeholder' && realCount <= 1) {
          this.log.warn(
            `Cannot remove default status from the only real ${serviceName} instance`,
          )
          throw new Error(
            `Cannot remove default status from the only real ${serviceName} instance`,
          )
        }

        // If we're removing default status but no new default is identified, that's an error
        if (desiredDefaultId === null) {
          this.log.warn(
            `Cannot remove default status without another ${serviceName} instance to make default`,
          )
          throw new Error(
            `You must set another ${serviceName} instance as default first`,
          )
        }
      }
    }

    // If setting as default, make all other instances non-default. Synced
    // instances only apply to the default, so clear them on demotion
    if (newDefaultStatus === true) {
      await trx(tableName)
        .whereNot('id', instanceId)
        .update({
          is_default: false,
          synced_instances: JSON.stringify([]),
          updated_at: this.timestamp,
        })
    }

    // Final safety check - at least one instance must be default at the end
    if (desiredDefaultId === null) {
      // Get the current default
      const currentDefault = await trx(tableName)
        .where('is_default', true)
        .first('id')

      if (!currentDefault) {
        this.log.warn(
          `No ${serviceName} instance will be default after this operation`,
        )
        throw new DefaultInstanceError(
          `At least one ${serviceName} instance must be default`,
        )
      }
    }
  }
}
