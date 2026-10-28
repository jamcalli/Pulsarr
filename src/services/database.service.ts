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

  public readonly isPostgres: boolean

  /** Inherits parent log level changes */
  public readonly log: FastifyBaseLogger

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

    this.bindMethods()
  }

  public get config() {
    return this.fastify.config
  }

  /** Use instead of the constructor so Postgres type parsers are configured before use */
  static async create(
    log: FastifyBaseLogger,
    fastify: FastifyInstance,
    testKnex?: Knex,
  ): Promise<DatabaseService> {
    const service = new DatabaseService(log, fastify, testKnex)

    if (fastify.config.dbType === 'postgres') {
      await service.configurePostgresTypes()
    }

    return service
  }

  /** Logs and swallows parser setup failures */
  public async configurePostgresTypes(): Promise<void> {
    try {
      await configurePgTypes(this.log)
      this.log.debug('PostgreSQL type parsers configured successfully')
    } catch (error) {
      this.log.error({ error }, 'Failed to configure PostgreSQL type parsers:')
    }
  }

  async close(): Promise<void> {
    await this.knex.destroy()
  }

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
        ;(this as Record<string, unknown>)[methodName] =
          methodFunction.bind(this)
        bound.add(methodName)
      }
    }
  }

  /** Accepts raw() output from either dialect, since Postgres wraps rows in { rows } and SQLite does not */
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

  public static createKnexConfig(
    config: FastifyInstance['config'],
    log: FastifyBaseLogger,
  ): Knex.Config {
    const isPostgres = config.dbType === 'postgres'

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

  /** Returns defaultValue on empty or invalid JSON and logs the parse error */
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

  /** Returns SQL for date1 minus date2 in days */
  public getDateDiffSQL(date1: string, date2: string, alias?: string): string {
    const diff = this.isPostgres
      ? `EXTRACT(EPOCH FROM (${date1} - ${date2})) / 86400`
      : `julianday(${date1}) - julianday(${date2})`

    return alias ? `${diff} AS ${alias}` : diff
  }

  public async transaction<T>(
    fn: (trx: Knex.Transaction) => Promise<T>,
  ): Promise<T> {
    return this.knex.transaction(fn)
  }

  public get timestamp() {
    return new Date().toISOString()
  }

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

  /** Throws when the change would leave no default, and promoting clears every other instance's default flag and synced instances */
  public async validateInstanceDefaultStatus(
    trx: Knex.Transaction,
    tableName: 'radarr_instances' | 'sonarr_instances',
    instanceId: number,
    newDefaultStatus: boolean | undefined,
    serviceName: 'Radarr' | 'Sonarr',
  ): Promise<void> {
    let desiredDefaultId: number | null = null

    if (newDefaultStatus === true) {
      desiredDefaultId = instanceId
    } else if (newDefaultStatus === false) {
      const currentInstance = await trx(tableName)
        .where('id', instanceId)
        .first()

      if (currentInstance?.is_default) {
        const otherInstance = await trx(tableName)
          .where('is_enabled', true)
          .whereNot('id', instanceId)
          .orderBy('id')
          .first('id')

        if (otherInstance) {
          desiredDefaultId = otherInstance.id
        }
      } else {
        const currentDefault = await trx(tableName)
          .where('is_default', true)
          .first('id')

        if (currentDefault) {
          desiredDefaultId = currentDefault.id
        }
      }
    } else {
      const currentDefault = await trx(tableName)
        .where('is_default', true)
        .first('id')

      if (currentDefault?.id === instanceId) {
        desiredDefaultId = instanceId
      } else if (currentDefault) {
        desiredDefaultId = currentDefault.id
      }
    }

    if (newDefaultStatus === false) {
      const currentInstance = await trx(tableName)
        .where('id', instanceId)
        .first()

      if (currentInstance?.is_default) {
        const totalInstancesCount = await trx(tableName)
          .count({ count: '*' })
          .first()

        const totalCount = totalInstancesCount?.count
          ? Number(totalInstancesCount.count)
          : 0

        if (totalCount <= 1) {
          this.log.warn(
            `Cannot remove default status from the only ${serviceName} instance`,
          )
          throw new Error(
            `Cannot remove default status from the only ${serviceName} instance`,
          )
        }

        // Placeholder rows (api_key 'placeholder') do not count as real instances
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

    // Synced instances only apply to the default, so clear them on demotion
    if (newDefaultStatus === true) {
      await trx(tableName)
        .whereNot('id', instanceId)
        .update({
          is_default: false,
          synced_instances: JSON.stringify([]),
          updated_at: this.timestamp,
        })
    }

    if (desiredDefaultId === null) {
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
