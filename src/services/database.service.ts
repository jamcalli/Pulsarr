/**
 * Database Service
 *
 * Provides the primary interface for interacting with the application's SQLite/PostgreSQL database.
 * This service is exposed to the application via the 'database' Fastify plugin
 * and can be accessed through the fastify.db decorator.
 *
 * ARCHITECTURE:
 * This service follows a modular architecture where database methods are organized into
 * separate modules by domain (users, watchlist, instances, etc.) and then dynamically
 * bound to this service class at runtime. This provides:
 * - Better code organization and maintainability
 * - Clear separation of concerns by domain
 * - Type safety through TypeScript method signature declarations
 * - Easy testing and mocking of individual method groups
 *
 * METHOD BINDING:
 * All database methods are defined in separate files under ./database/methods/ and
 * their TypeScript signatures are declared in ./database/types/. The bindMethods()
 * function dynamically attaches these methods to the DatabaseService instance,
 * allowing them to be called as if they were native class methods.
 *
 * RESPONSIBILITIES:
 * - User management (creation, retrieval, updating)
 * - Admin user management (authentication, password handling)
 * - Application configuration storage and retrieval
 * - Sonarr/Radarr instance configuration and management
 * - Content routing rules for automated distribution
 * - Watchlist item tracking and status management
 * - Many-to-many relationship management via junction tables
 * - Notification creation, delivery, and history
 * - RSS feed processing and temporary storage
 * - Analytics and statistics generation
 * - Genre and media metadata management
 * - Instance content synchronization tracking
 * - Webhook management for external integrations
 * - Plex session monitoring for rolling content management
 *
 * Uses Knex.js query builder to interact with SQLite or PostgreSQL databases,
 * providing a clean, consistent interface for all database operations.
 *
 * @example
 * // Accessing the service in route handlers:
 * fastify.get('/api/users', async (request, reply) => {
 *   const users = await fastify.db.getAllUsers();
 *   return users;
 * });
 */

import { DefaultInstanceError } from '@root/types/errors.js'
import type {
  Condition,
  ConditionGroup,
  RouterRule,
} from '@root/types/router.types.js'
import { createServiceLogger } from '@utils/logger.js'
import { configurePgTypes } from '@utils/postgres-config.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import knex, { type Knex } from 'knex'
import './database/types/analytics-methods.js'
import './database/types/anime-methods.js'
import './database/types/approval-methods.js'
import './database/types/config-methods.js'
import './database/types/instance-methods.js'
import './database/types/junction-methods.js'
import './database/types/notification-methods.js'
import './database/types/plex-label-sync-methods.js'
import './database/types/plex-label-tracking-methods.js'
import './database/types/quota-methods.js'
import './database/types/router-methods.js'
import './database/types/scheduler-methods.js'
import './database/types/session-methods.js'
import './database/types/user-methods.js'
import './database/types/watchlist-methods.js'
import './database/types/webhook-methods.js'
import './database/types/api-key-methods.js'
import * as analyticsMethods from './database/methods/analytics.js'
import * as animeMethods from './database/methods/anime.js'
import * as apiKeyMethods from './database/methods/api-keys.js'
import * as approvalMethods from './database/methods/approval.js'
import * as configMethods from './database/methods/config.js'
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
import * as webhookMethods from './database/methods/webhook.js'

export class DatabaseService {
  public readonly knex: Knex
  public log: FastifyBaseLogger

  /**
   * Flag indicating whether we're using PostgreSQL (true) or SQLite (false)
   */
  public readonly isPostgres: boolean

  /**
   * Creates a new DatabaseService instance
   *
   * @param log - Fastify logger instance for recording database operations
   * @param fastify - Fastify instance containing configuration and context
   */
  constructor(
    public readonly baseLog: FastifyBaseLogger,
    public readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(this.baseLog, 'DATABASE')
    this.isPostgres = fastify.config.dbType === 'postgres'
    this.knex = knex(DatabaseService.createKnexConfig(fastify.config, this.log))

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
  ): Promise<DatabaseService> {
    const service = new DatabaseService(log, fastify)

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

  /**
   * Helper method to check if we're using PostgreSQL
   */
  public isPostgreSQL(): boolean {
    return this.isPostgres
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
    this.log.error('Unexpected raw query result format', {
      result,
      resultType: typeof result,
      isArray: Array.isArray(result),
      hasRows: result && typeof result === 'object' && 'rows' in result,
    })
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
              cb: () => void,
            ) => {
              // SQLite-specific optimizations
              conn.exec('PRAGMA journal_mode = WAL;')
              conn.exec('PRAGMA foreign_keys = ON;')
              cb()
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
      this.log.warn('JSON parse error', { value, context, error })
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
   * Converts a nullable value to boolean with default fallback
   *
   * @param value - The value to convert (can be null or undefined)
   * @param defaultValue - The default boolean value to return if value is null/undefined
   * @returns The converted boolean value or the default
   */
  public toBoolean(value: unknown, defaultValue: boolean): boolean {
    return value == null ? defaultValue : Boolean(value)
  }

  /**
   * Helper method to split arrays into smaller chunks for processing
   *
   * @param array - Array to split into chunks
   * @param size - Maximum size of each chunk
   * @returns Array of arrays containing the chunked data
   */
  public chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Returns the current timestamp in ISO format
   */
  public get timestamp() {
    return new Date().toISOString()
  }

  /**
   * Returns a date in YYYY-MM-DD format using server's local timezone
   * Respects the TZ environment variable set in Docker
   */
  public getLocalDateString(date: Date = new Date()): string {
    return date.toLocaleDateString('sv-SE') // 'sv-SE' gives YYYY-MM-DD format in local timezone
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
   * Normalises/validates minimumAvailability values for Radarr
   * Validates against allowed values: 'announced', 'inCinemas', 'released'
   * Throws error for invalid values, returns default 'released' for null/undefined
   */
  public normaliseMinimumAvailability(
    value?: string | null,
  ): 'announced' | 'inCinemas' | 'released' {
    const allowed = ['announced', 'inCinemas', 'released'] as const
    type MinimumAvailability = (typeof allowed)[number]
    const defaultValue = 'released' as MinimumAvailability

    // Return default for null/undefined
    if (value === undefined || value === null) {
      return defaultValue
    }

    // Normalize the input value by trimming whitespace and converting to lowercase
    const v = value.toString().trim()
    const canonical = v.toLowerCase()

    // Find the matching allowed value (case-insensitive)
    const match = allowed.find(
      (allowedValue) => allowedValue.toLowerCase() === canonical,
    )

    // If no match is found, throw an error
    if (!match) {
      throw new Error(`Invalid minimumAvailability value: ${v}`)
    }

    // Return the properly cased value from the allowed list
    return match as MinimumAvailability
  }

  /**
   * Normalises/validates monitorNewItems, throws on bad input
   */
  public normaliseMonitorNewItems(
    value: string | undefined | null,
  ): 'all' | 'none' {
    if (value === undefined || value === null) {
      throw new Error('monitorNewItems must be provided (all|none)')
    }

    const normalized = value.toLowerCase()
    if (!['all', 'none'].includes(normalized)) {
      throw new Error(`Invalid monitorNewItems value: ${value}`)
    }
    return normalized as 'all' | 'none'
  }

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

    // If setting as default, make all other instances non-default
    if (newDefaultStatus === true) {
      await trx(tableName).whereNot('id', instanceId).update({
        is_default: false,
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

  //=============================================================================
  // CONTENT ROUTER HELPERS
  //=============================================================================

  /**
   * Helper method to format a router rule from the database
   * Ensures proper type conversions for boolean fields and JSON parsing
   */
  public formatRouterRule(rule: {
    id: number
    name: string
    type: string
    criteria: string | Record<string, unknown>
    target_type: 'sonarr' | 'radarr'
    target_instance_id: number
    root_folder?: string | null
    quality_profile?: number | null
    tags?: string | string[]
    order: number
    enabled: number | boolean
    metadata?: string | null
    search_on_add?: number | boolean | null
    season_monitoring?: string | null
    // Action fields
    always_require_approval?: number | boolean
    bypass_user_quotas?: number | boolean
    approval_reason?: string | null
    created_at: string
    updated_at: string
    [key: string]: unknown
  }): RouterRule {
    return {
      ...rule,
      enabled: Boolean(rule.enabled),
      search_on_add:
        rule.search_on_add == null ? null : Boolean(rule.search_on_add),
      // Action fields
      always_require_approval: Boolean(rule.always_require_approval ?? false),
      bypass_user_quotas: Boolean(rule.bypass_user_quotas ?? false),
      approval_reason: rule.approval_reason ?? null,
      criteria:
        typeof rule.criteria === 'string'
          ? this.safeJsonParse(rule.criteria, {}, 'router_rule.criteria')
          : rule.criteria,
      tags:
        typeof rule.tags === 'string'
          ? this.safeJsonParse(rule.tags, [], 'router_rule.tags')
          : rule.tags || [],
      metadata: rule.metadata
        ? typeof rule.metadata === 'string'
          ? this.safeJsonParse(rule.metadata, null, 'router_rule.metadata')
          : rule.metadata
        : null,
    }
  }

  // Helper to validate condition structure
  public readonly VALID_OPERATORS = [
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'in',
    'notIn',
    'greaterThan',
    'lessThan',
    'between',
    'regex',
  ]

  /**
   * Validates a condition or condition group for structure and content
   *
   * This helper checks that conditions have the correct structure and contain
   * valid values for their operators. It performs recursive validation of
   * nested condition groups with depth limiting to prevent stack overflows.
   *
   * @param condition - The condition or condition group to validate
   * @param depth - Current recursion depth (for preventing stack overflow)
   * @returns Object indicating if the condition is valid and any error message
   */
  public validateCondition(
    condition: Condition | ConditionGroup,
    depth = 0,
  ): { valid: boolean; error?: string } {
    try {
      // Prevent excessive nesting that could cause stack overflow
      if (depth > 20) {
        return {
          valid: false,
          error: 'Maximum condition nesting depth exceeded (20 levels)',
        }
      }

      // Check if it's a condition group
      if ('operator' in condition && 'conditions' in condition) {
        // Validate group operator
        const operator = condition.operator.toUpperCase()
        if (!['AND', 'OR'].includes(operator)) {
          return {
            valid: false,
            error: `Invalid group operator: ${condition.operator}. Expected 'AND' or 'OR'.`,
          }
        }

        // Check if conditions is an array
        if (!Array.isArray(condition.conditions)) {
          return { valid: false, error: 'conditions must be an array' }
        }

        // Check if conditions array is empty
        if (condition.conditions.length === 0) {
          return {
            valid: false,
            error: 'condition group must have at least one condition',
          }
        }

        // Recursively validate all conditions in the group with incremented depth
        for (const subCondition of condition.conditions) {
          const result = this.validateCondition(subCondition, depth + 1)
          if (!result.valid) return result
        }

        return { valid: true }
      }

      // Check if it's a simple condition
      if (
        'field' in condition &&
        'operator' in condition &&
        'value' in condition
      ) {
        // Validate field
        if (typeof condition.field !== 'string' || !condition.field.trim()) {
          return { valid: false, error: 'field must be a non-empty string' }
        }

        // Validate operator against canonical list
        if (!this.VALID_OPERATORS.includes(condition.operator)) {
          return {
            valid: false,
            error: `Invalid operator: ${condition.operator}. Valid operators are: ${this.VALID_OPERATORS.join(', ')}`,
          }
        }

        // Validate value based on operator type
        if (condition.value === undefined || condition.value === null) {
          return { valid: false, error: 'value cannot be undefined or null' }
        }

        // For array operators, check that value is a non-empty array
        if (['in', 'notIn'].includes(condition.operator)) {
          if (!Array.isArray(condition.value)) {
            return {
              valid: false,
              error: `Value for ${condition.operator} operator must be an array`,
            }
          }
          if (condition.value.length === 0) {
            return {
              valid: false,
              error: `Value for ${condition.operator} operator cannot be an empty array`,
            }
          }
        }

        // For scalar operators, ensure the value is meaningful
        if (
          ['equals', 'notEquals', 'contains', 'notContains'].includes(
            condition.operator,
          )
        ) {
          if (
            typeof condition.value === 'string' &&
            condition.value.trim() === ''
          ) {
            return {
              valid: false,
              error: `Value for ${condition.operator} operator cannot be an empty string`,
            }
          }
        }

        // Special validation for regex operator
        if (condition.operator === 'regex') {
          if (
            typeof condition.value !== 'string' ||
            condition.value.trim() === ''
          ) {
            return {
              valid: false,
              error:
                'Value for regex operator must be a non-empty string containing a valid pattern',
            }
          }
          try {
            // Attempt to compile the pattern to catch syntax errors early
            new RegExp(condition.value)
          } catch (error) {
            return {
              valid: false,
              error: `Invalid regular expression pattern: ${(error as Error).message}`,
            }
          }
        }

        // For numeric comparison operators, ensure value is a number
        if (['greaterThan', 'lessThan'].includes(condition.operator)) {
          if (typeof condition.value !== 'number') {
            return {
              valid: false,
              error: `Value for ${condition.operator} operator must be a number`,
            }
          }
        }

        // For between operator, validate the range object structure
        if (condition.operator === 'between') {
          if (typeof condition.value !== 'object' || condition.value === null) {
            return {
              valid: false,
              error:
                'Value for between operator must be an object with min and/or max properties',
            }
          }

          interface RangeValue {
            min?: number
            max?: number
          }

          const rangeValue = condition.value as RangeValue

          // Check for missing bounds
          if (!('min' in rangeValue) && !('max' in rangeValue)) {
            return {
              valid: false,
              error:
                'Range comparison requires at least min or max to be specified',
            }
          }

          // Validate numeric types
          if ('min' in rangeValue && typeof rangeValue.min !== 'number') {
            return {
              valid: false,
              error: 'min value must be a number',
            }
          }

          if ('max' in rangeValue && typeof rangeValue.max !== 'number') {
            return {
              valid: false,
              error: 'max value must be a number',
            }
          }

          // Validate range logic when both bounds are present
          if (
            rangeValue.min !== undefined &&
            rangeValue.max !== undefined &&
            rangeValue.min > rangeValue.max
          ) {
            return {
              valid: false,
              error:
                'Invalid range: min value cannot be greater than max value',
            }
          }
        }

        return { valid: true }
      }

      return { valid: false, error: 'Invalid condition structure' }
    } catch (error) {
      return {
        valid: false,
        error:
          error instanceof Error ? error.message : 'Unknown validation error',
      }
    }
  }

  /*
   * Note: All database methods for specific domains (users, watchlist, instances, etc.)
   * are implemented in separate module files under ./database/methods/ and bound to
   * this service instance via the bindMethods() function above.
   *
   * Type definitions for these methods can be found in ./database/types/
   *
   * This modular approach provides better code organization while maintaining
   * the convenience of calling methods directly on the database service instance.
   */
}
