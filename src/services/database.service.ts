/**
 * Database Service
 *
 * Provides the primary interface for interacting with the application's better-sqlite3 database.
 * This service is exposed to the application via the 'database' Fastify plugin
 * and can be accessed through the fastify.db decorator.
 *
 * Responsible for:
 * - User management (creation, retrieval, updating)
 * - Admin user management (authentication, password handling)
 * - Application configuration storage and retrieval
 * - Sonarr/Radarr instance configuration and management
 * - Genre routing rules for content distribution
 * - Watchlist item tracking and status management
 * - Many-to-many relationship management via junction tables
 * - Notification creation, delivery, and history
 * - RSS feed processing and temporary storage
 * - Analytics and statistics generation
 * - Genre and media metadata management
 * - Instance content synchronization tracking
 *
 * Uses Knex.js query builder to interact with the better-sqlite3 database,
 * providing a clean, consistent interface for all database operations.
 *
 * @example
 * // Accessing the service in route handlers:
 * fastify.get('/api/users', async (request, reply) => {
 *   const users = await fastify.db.getAllUsers();
 *   return users;
 * });
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import knex, { type Knex } from 'knex'
import type { Config, User } from '@root/types/config.types.js'
import type {
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type { AdminUser } from '@schemas/auth/auth.js'
import type {
  SonarrInstance,
  SonarrGenreRoute,
  SonarrEpisodeSchema,
  MediaNotification,
  NotificationResult,
} from '@root/types/sonarr.types.js'
import type {
  RadarrInstance,
  RadarrGenreRoute,
} from '@root/types/radarr.types.js'
import type {
  WatchlistInstanceStatus,
  MainTableField,
  JunctionTableField,
  WatchlistItemUpdate,
} from '@root/types/watchlist-status.types.js'

export class DatabaseService {
  private readonly knex: Knex

  /**
   * Creates a new DatabaseService instance
   *
   * @param log - Fastify logger instance for recording database operations
   * @param config - Fastify configuration containing database connection details
   */
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly config: FastifyInstance['config'],
  ) {
    this.knex = knex(DatabaseService.createKnexConfig(config.dbPath, log))
  }

  /**
   * Creates Knex configuration for better-sqlite3
   *
   * Sets up connection pooling, logging, and other database-specific configurations.
   *
   * @param dbPath - Path to the SQLite database file
   * @param log - Logger to use for database operations
   * @returns Knex configuration object
   */
  private static createKnexConfig(
    dbPath: string,
    log: FastifyBaseLogger,
  ): Knex.Config {
    return {
      client: 'better-sqlite3',
      connection: {
        filename: dbPath,
      },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1,
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
   * Closes the database connection
   *
   * Should be called during application shutdown to properly clean up resources.
   */
  async close(): Promise<void> {
    await this.knex.destroy()
  }

  //=============================================================================
  // USER MANAGEMENT
  //=============================================================================

  /**
   * Creates a new user in the database
   *
   * @param userData - User data excluding id and timestamps
   * @returns Promise resolving to the created user with ID and timestamps
   */
  async createUser(
    userData: Omit<User, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<User> {
    const [id] = await this.knex('users')
      .insert({
        ...userData,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('id')

    if (!id) throw new Error('Failed to create user')

    const user: User = {
      ...userData,
      id,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    }

    return user
  }

  /**
   * Retrieves a user by ID or name
   *
   * @param identifier - User ID (number) or username (string)
   * @returns Promise resolving to the user if found, undefined otherwise
   */
  async getUser(identifier: number | string): Promise<User | undefined> {
    const row = await this.knex('users')
      .where(
        typeof identifier === 'number'
          ? { id: identifier }
          : { name: identifier },
      )
      .first()

    if (!row) return undefined

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      alias: row.alias,
      discord_id: row.discord_id,
      notify_email: Boolean(row.notify_email),
      notify_discord: Boolean(row.notify_discord),
      can_sync: Boolean(row.can_sync),
      created_at: row.created_at,
      updated_at: row.updated_at,
    } satisfies User
  }

  /**
   * Updates a user's information
   *
   * @param id - ID of the user to update
   * @param data - Partial user data to update
   * @returns Promise resolving to true if the user was updated, false otherwise
   */
  async updateUser(
    id: number,
    data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>,
  ): Promise<boolean> {
    const updated = await this.knex('users')
      .where({ id })
      .update({
        ...data,
        updated_at: this.timestamp,
      })
    return updated > 0
  }

  /**
   * Retrieves all users in the database
   *
   * @returns Promise resolving to an array of all users
   */
  async getAllUsers(): Promise<User[]> {
    const rows = await this.knex('users').select('*').orderBy('name', 'asc')

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      alias: row.alias,
      discord_id: row.discord_id,
      notify_email: Boolean(row.notify_email),
      notify_discord: Boolean(row.notify_discord),
      can_sync: Boolean(row.can_sync),
      created_at: row.created_at,
      updated_at: row.updated_at,
    })) satisfies User[]
  }

  /**
   * Retrieves all users with their watchlist item counts
   *
   * @returns Promise resolving to array of users with watchlist count property
   */
  async getUsersWithWatchlistCount(): Promise<
    (User & { watchlist_count: number })[]
  > {
    const rows = await this.knex('users')
      .select([
        'users.*',
        this.knex.raw('COUNT(watchlist_items.id) as watchlist_count'),
      ])
      .leftJoin('watchlist_items', 'users.id', 'watchlist_items.user_id')
      .groupBy('users.id')
      .orderBy('users.name', 'asc')

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      alias: row.alias,
      discord_id: row.discord_id,
      notify_email: Boolean(row.notify_email),
      notify_discord: Boolean(row.notify_discord),
      can_sync: Boolean(row.can_sync),
      created_at: row.created_at,
      updated_at: row.updated_at,
      watchlist_count: Number(row.watchlist_count),
    })) satisfies (User & { watchlist_count: number })[]
  }

  /**
   * Creates a new admin user in the database
   *
   * @param userData - Admin user data including email, username, password, and role
   * @returns Promise resolving to true if created successfully
   */
  async createAdminUser(userData: {
    email: string
    username: string
    password: string
    role: string
  }): Promise<boolean> {
    const created = await this.knex('admin_users').insert({
      ...userData,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    return created.length > 0
  }

  /**
   * Retrieves an admin user by email
   *
   * @param email - Email address of the admin user
   * @returns Promise resolving to the admin user if found, undefined otherwise
   */
  async getAdminUser(email: string): Promise<AdminUser | undefined> {
    return await this.knex('admin_users')
      .select('id', 'username', 'email', 'password', 'role')
      .where({ email })
      .first()
  }

  /**
   * Retrieves an admin user by username
   *
   * @param username - Username of the admin user
   * @returns Promise resolving to the admin user if found, undefined otherwise
   */
  async getAdminUserByUsername(
    username: string,
  ): Promise<AdminUser | undefined> {
    return await this.knex('admin_users')
      .select('id', 'username', 'email', 'password', 'role')
      .where({ username })
      .first()
  }

  /**
   * Checks if any admin users exist in the database
   *
   * @returns Promise resolving to true if admin users exist, false otherwise
   */
  async hasAdminUsers(): Promise<boolean> {
    const count = await this.knex('admin_users').count('* as count').first()
    return Boolean(count && (count.count as number) > 0)
  }

  /**
   * Updates an admin user's password
   *
   * @param email - Email address of the admin user
   * @param hashedPassword - New hashed password
   * @returns Promise resolving to true if password was updated, false otherwise
   */
  async updateAdminPassword(
    email: string,
    hashedPassword: string,
  ): Promise<boolean> {
    const updated = await this.knex('admin_users').where({ email }).update({
      password: hashedPassword,
      updated_at: this.timestamp,
    })
    return updated > 0
  }

  /**
   * Checks if any users have sync disabled
   *
   * @returns Promise resolving to true if any users have sync disabled, false otherwise
   */
  async hasUsersWithSyncDisabled(): Promise<boolean> {
    try {
      const count = await this.knex('users')
        .where({ can_sync: false })
        .count('* as count')
        .first()

      return Number(count?.count || 0) > 0
    } catch (error) {
      this.log.error('Error checking for users with sync disabled:', error)
      return true
    }
  }

  //=============================================================================
  // CONFIGURATION MANAGEMENT
  //=============================================================================

  /**
   * Retrieves application configuration by ID
   *
   * @param id - Configuration ID (always 1)
   * @returns Promise resolving to the configuration if found, undefined otherwise
   */
  async getConfig(id: number): Promise<Config | undefined> {
    const config = await this.knex('configs').where({ id }).first()
    if (!config) return undefined
    return {
      ...config,
      // Parse JSON fields
      plexTokens: JSON.parse(config.plexTokens || '[]'),
      // Handle optional RSS fields
      selfRss: config.selfRss || undefined,
      friendsRss: config.friendsRss || undefined,
      // Handle optional Discord fields
      discordWebhookUrl: config.discordWebhookUrl || undefined,
      discordBotToken: config.discordBotToken || undefined,
      discordClientId: config.discordClientId || undefined,
      discordGuildId: config.discordGuildId || undefined,
      // Handle app configuration
      baseUrl: config.baseUrl || undefined,
      // Handle timing defaults
      syncIntervalSeconds: config.syncIntervalSeconds || 10,
      queueProcessDelaySeconds: config.queueProcessDelaySeconds || 60,
      // Handle notification timing defaults
      queueWaitTime: config.queueWaitTime || 120000,
      newEpisodeThreshold: config.newEpisodeThreshold || 172800000,
      upgradeBufferTime: config.upgradeBufferTime || 2000,
      // Convert boolean fields
      cookieSecured: Boolean(config.cookieSecured),
      skipFriendSync: Boolean(config.skipFriendSync),
      deleteMovie: Boolean(config.deleteMovie),
      deleteEndedShow: Boolean(config.deleteEndedShow),
      deleteContinuingShow: Boolean(config.deleteContinuingShow),
      deleteFiles: Boolean(config.deleteFiles),
      _isReady: Boolean(config._isReady),
    }
  }

  /**
   * Creates a new configuration entry in the database
   *
   * @param config - Configuration data excluding timestamps
   * @returns Promise resolving to the ID of the created configuration
   */
  async createConfig(
    config: Omit<Config, 'created_at' | 'updated_at'>,
  ): Promise<number> {
    const [id] = await this.knex('configs')
      .insert({
        // Basic fields
        port: config.port,
        dbPath: config.dbPath,
        baseUrl: config.baseUrl,
        cookieSecret: config.cookieSecret,
        cookieName: config.cookieName,
        cookieSecured: config.cookieSecured,
        logLevel: config.logLevel,
        closeGraceDelay: config.closeGraceDelay,
        rateLimitMax: config.rateLimitMax,
        // Timing fields
        syncIntervalSeconds: config.syncIntervalSeconds || 10,
        queueProcessDelaySeconds: config.queueProcessDelaySeconds || 60,
        // Notification timing fields
        queueWaitTime: config.queueWaitTime || 120000,
        newEpisodeThreshold: config.newEpisodeThreshold || 172800000,
        upgradeBufferTime: config.upgradeBufferTime || 2000,
        // Plex fields
        plexTokens: JSON.stringify(config.plexTokens || []),
        skipFriendSync: config.skipFriendSync,
        // Delete fields
        deleteMovie: config.deleteMovie,
        deleteEndedShow: config.deleteEndedShow,
        deleteContinuingShow: config.deleteContinuingShow,
        deleteIntervalDays: config.deleteIntervalDays,
        deleteFiles: config.deleteFiles,
        // RSS fields
        selfRss: config.selfRss,
        friendsRss: config.friendsRss,
        // Discord fields
        discordWebhookUrl: config.discordWebhookUrl,
        discordBotToken: config.discordBotToken,
        discordClientId: config.discordClientId,
        discordGuildId: config.discordGuildId,
        // Ready state
        _isReady: config._isReady || false,
        // Timestamps
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('id')
    this.log.info(`Config created with ID: ${id}`)
    return id
  }

  /**
   * Updates an existing configuration entry
   *
   * @param id - ID of the configuration to update
   * @param config - Partial configuration data to update
   * @returns Promise resolving to true if the configuration was updated, false otherwise
   */
  async updateConfig(id: number, config: Partial<Config>): Promise<boolean> {
    const updateData: Record<string, unknown> = {
      updated_at: this.timestamp,
    }

    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        if (
          key === 'selfRss' ||
          key === 'friendsRss' ||
          key === 'discordWebhookUrl' ||
          key === 'discordBotToken' ||
          key === 'discordClientId' ||
          key === 'discordGuildId'
        ) {
          updateData[key] = value
        } else if (
          Array.isArray(value) ||
          (typeof value === 'object' && value !== null)
        ) {
          updateData[key] = JSON.stringify(value)
        } else {
          updateData[key] = value
        }
      }
    }

    const updated = await this.knex('configs').where({ id }).update(updateData)
    return updated > 0
  }

  //=============================================================================
  // SONARR INSTANCE MANAGEMENT
  //=============================================================================

  /**
   * Retrieves all enabled Sonarr instances
   *
   * @returns Promise resolving to an array of all enabled Sonarr instances
   */
  async getAllSonarrInstances(): Promise<SonarrInstance[]> {
    const instances = await this.knex('sonarr_instances')
      .where('is_enabled', true)
      .select('*')

    return instances.map((instance) => ({
      id: instance.id,
      name: instance.name,
      baseUrl: instance.base_url,
      apiKey: instance.api_key,
      qualityProfile: instance.quality_profile,
      rootFolder: instance.root_folder,
      bypassIgnored: Boolean(instance.bypass_ignored),
      seasonMonitoring: instance.season_monitoring,
      tags: JSON.parse(instance.tags || '[]'),
      isDefault: Boolean(instance.is_default),
      syncedInstances: JSON.parse(instance.synced_instances || '[]'),
    }))
  }

  /**
   * Retrieves the default Sonarr instance
   *
   * @returns Promise resolving to the default Sonarr instance if found, null otherwise
   */
  async getDefaultSonarrInstance(): Promise<SonarrInstance | null> {
    const instance = await this.knex('sonarr_instances')
      .where({
        is_default: true,
        is_enabled: true,
      })
      .first()

    if (!instance) return null

    return {
      id: instance.id,
      name: instance.name,
      baseUrl: instance.base_url,
      apiKey: instance.api_key,
      qualityProfile: instance.quality_profile,
      rootFolder: instance.root_folder,
      bypassIgnored: Boolean(instance.bypass_ignored),
      seasonMonitoring: instance.season_monitoring,
      tags: JSON.parse(instance.tags || '[]'),
      isDefault: true,
      syncedInstances: JSON.parse(instance.synced_instances || '[]'),
    }
  }

  /**
   * Retrieves a specific Sonarr instance by ID
   *
   * @param id - ID of the Sonarr instance to retrieve
   * @returns Promise resolving to the Sonarr instance if found, null otherwise
   */
  async getSonarrInstance(id: number): Promise<SonarrInstance | null> {
    const instance = await this.knex('sonarr_instances').where('id', id).first()

    if (!instance) return null

    return {
      id: instance.id,
      name: instance.name,
      baseUrl: instance.base_url,
      apiKey: instance.api_key,
      qualityProfile: instance.quality_profile,
      rootFolder: instance.root_folder,
      bypassIgnored: Boolean(instance.bypass_ignored),
      seasonMonitoring: instance.season_monitoring,
      tags: JSON.parse(instance.tags || '[]'),
      isDefault: Boolean(instance.is_default),
      syncedInstances: JSON.parse(instance.synced_instances || '[]'),
    }
  }

  /**
   * Creates a new Sonarr instance in the database
   *
   * @param instance - Sonarr instance data excluding ID
   * @returns Promise resolving to the ID of the created instance
   * @throws Error if instance creation fails
   */
  async createSonarrInstance(
    instance: Omit<SonarrInstance, 'id'>,
  ): Promise<number> {
    if (instance.isDefault) {
      await this.knex('sonarr_instances')
        .where('is_default', true)
        .update('is_default', false)
    }

    const result = await this.knex('sonarr_instances')
      .insert({
        name: instance.name || 'Default Sonarr Instance',
        base_url: instance.baseUrl,
        api_key: instance.apiKey,
        quality_profile: instance.qualityProfile,
        root_folder: instance.rootFolder,
        bypass_ignored: instance.bypassIgnored,
        season_monitoring: instance.seasonMonitoring,
        tags: JSON.stringify(instance.tags || []),
        is_default: instance.isDefault ?? false,
        is_enabled: true,
        synced_instances: JSON.stringify(instance.syncedInstances || []),
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('id')

    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error('No ID returned from database')
    }

    const row = result[0]
    if (typeof row !== 'object' || !('id' in row)) {
      throw new Error('Invalid ID returned from database')
    }

    return row.id
  }

  /**
   * Updates an existing Sonarr instance
   *
   * @param id - ID of the Sonarr instance to update
   * @param updates - Partial Sonarr instance data to update
   * @returns Promise resolving to void when complete
   */
  async updateSonarrInstance(
    id: number,
    updates: Partial<SonarrInstance>,
  ): Promise<void> {
    if (updates.isDefault) {
      await this.knex('sonarr_instances')
        .whereNot('id', id)
        .where('is_default', true)
        .update('is_default', false)
    }

    await this.knex('sonarr_instances')
      .where('id', id)
      .update({
        ...(typeof updates.name !== 'undefined' && { name: updates.name }),
        ...(typeof updates.baseUrl !== 'undefined' && {
          base_url: updates.baseUrl,
        }),
        ...(typeof updates.apiKey !== 'undefined' && {
          api_key: updates.apiKey,
        }),
        ...(typeof updates.qualityProfile !== 'undefined' && {
          quality_profile: updates.qualityProfile,
        }),
        ...(typeof updates.rootFolder !== 'undefined' && {
          root_folder: updates.rootFolder,
        }),
        ...(typeof updates.bypassIgnored !== 'undefined' && {
          bypass_ignored: updates.bypassIgnored,
        }),
        ...(typeof updates.seasonMonitoring !== 'undefined' && {
          season_monitoring: updates.seasonMonitoring,
        }),
        ...(typeof updates.tags !== 'undefined' && {
          tags: JSON.stringify(updates.tags),
        }),
        ...(typeof updates.isDefault !== 'undefined' && {
          is_default: updates.isDefault,
        }),
        ...(typeof updates.syncedInstances !== 'undefined' && {
          synced_instances: JSON.stringify(updates.syncedInstances),
        }),
        updated_at: this.timestamp,
      })
  }

  /**
   * Cleans up references to a deleted Sonarr instance
   *
   * Removes the deleted instance ID from synced_instances fields of other instances
   *
   * @param deletedId - ID of the deleted Sonarr instance
   * @returns Promise resolving to void when complete
   */
  async cleanupDeletedSonarrInstanceReferences(
    deletedId: number,
  ): Promise<void> {
    try {
      const instances = await this.knex('sonarr_instances').select(
        'id',
        'synced_instances',
      )

      for (const instance of instances) {
        try {
          const syncedInstances = JSON.parse(instance.synced_instances || '[]')

          if (
            Array.isArray(syncedInstances) &&
            syncedInstances.includes(deletedId)
          ) {
            const updatedInstances = syncedInstances.filter(
              (id) => id !== deletedId,
            )

            await this.knex('sonarr_instances')
              .where('id', instance.id)
              .update({
                synced_instances: JSON.stringify(updatedInstances),
                updated_at: this.timestamp,
              })

            this.log.debug(
              `Removed deleted Sonarr instance ${deletedId} from synced_instances of instance ${instance.id}`,
            )
          }
        } catch (parseError) {
          this.log.error(
            `Error parsing synced_instances for Sonarr instance ${instance.id}:`,
            parseError,
          )
        }
      }
    } catch (error) {
      this.log.error(
        `Error cleaning up references to deleted Sonarr instance ${deletedId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Deletes a Sonarr instance and cleans up references to it
   *
   * @param id - ID of the Sonarr instance to delete
   * @returns Promise resolving to void when complete
   */
  async deleteSonarrInstance(id: number): Promise<void> {
    try {
      await this.cleanupDeletedSonarrInstanceReferences(id)

      await this.knex('sonarr_instances').where('id', id).delete()

      this.log.info(`Deleted Sonarr instance ${id} and cleaned up references`)
    } catch (error) {
      this.log.error(`Error deleting Sonarr instance ${id}:`, error)
      throw error
    }
  }

  //=============================================================================
  // SONARR GENRE ROUTING
  //=============================================================================

  /**
   * Retrieves all Sonarr genre routing rules
   *
   * @returns Promise resolving to an array of all Sonarr genre routes
   */
  async getSonarrGenreRoutes(): Promise<SonarrGenreRoute[]> {
    const routes = await this.knex('sonarr_genre_routing').select('*')

    return routes.map((route) => ({
      id: route.id,
      sonarrInstanceId: route.sonarr_instance_id,
      name: route.name,
      genre: route.genre,
      rootFolder: route.root_folder,
      qualityProfile: route.quality_profile,
    }))
  }

  /**
   * Creates a new Sonarr genre routing rule
   *
   * @param route - Sonarr genre route data excluding ID
   * @returns Promise resolving to the created genre route
   */
  async createSonarrGenreRoute(
    route: Omit<SonarrGenreRoute, 'id'>,
  ): Promise<SonarrGenreRoute> {
    const [createdRoute] = await this.knex('sonarr_genre_routing')
      .insert({
        sonarr_instance_id: route.sonarrInstanceId,
        name: route.name,
        genre: route.genre,
        root_folder: route.rootFolder,
        quality_profile: route.qualityProfile,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning([
        'id',
        'name',
        'sonarr_instance_id as sonarrInstanceId',
        'genre',
        'root_folder as rootFolder',
        'quality_profile as qualityProfile',
      ])

    return createdRoute
  }

  /**
   * Updates an existing Sonarr genre routing rule
   *
   * @param id - ID of the genre route to update
   * @param updates - Partial genre route data to update
   * @returns Promise resolving to void when complete
   */
  async updateSonarrGenreRoute(
    id: number,
    updates: Partial<SonarrGenreRoute>,
  ): Promise<void> {
    await this.knex('sonarr_genre_routing')
      .where('id', id)
      .update({
        ...(updates.name && { name: updates.name }),
        ...(updates.genre && { genre: updates.genre }),
        ...(updates.rootFolder && { root_folder: updates.rootFolder }),
        ...(updates.qualityProfile && {
          quality_profile: updates.qualityProfile,
        }),
        updated_at: this.timestamp,
      })
  }

  /**
   * Deletes a Sonarr genre routing rule
   *
   * @param id - ID of the genre route to delete
   * @returns Promise resolving to void when complete
   */
  async deleteSonarrGenreRoute(id: number): Promise<void> {
    await this.knex('sonarr_genre_routing').where('id', id).delete()
  }

  //=============================================================================
  // RADARR INSTANCE MANAGEMENT
  //=============================================================================

  /**
   * Retrieves all enabled Radarr instances
   *
   * @returns Promise resolving to an array of all enabled Radarr instances
   */
  async getAllRadarrInstances(): Promise<RadarrInstance[]> {
    const instances = await this.knex('radarr_instances')
      .where('is_enabled', true)
      .select('*')
    return instances.map((instance) => ({
      id: instance.id,
      name: instance.name,
      baseUrl: instance.base_url,
      apiKey: instance.api_key,
      qualityProfile: instance.quality_profile,
      rootFolder: instance.root_folder,
      bypassIgnored: Boolean(instance.bypass_ignored),
      tags: JSON.parse(instance.tags || '[]'),
      isDefault: Boolean(instance.is_default),
      syncedInstances: JSON.parse(instance.synced_instances || '[]'),
    }))
  }

  /**
   * Retrieves the default Radarr instance
   *
   * @returns Promise resolving to the default Radarr instance if found, null otherwise
   */
  async getDefaultRadarrInstance(): Promise<RadarrInstance | null> {
    const instance = await this.knex('radarr_instances')
      .where({
        is_default: true,
        is_enabled: true,
      })
      .first()
    if (!instance) return null
    return {
      id: instance.id,
      name: instance.name,
      baseUrl: instance.base_url,
      apiKey: instance.api_key,
      qualityProfile: instance.quality_profile,
      rootFolder: instance.root_folder,
      bypassIgnored: Boolean(instance.bypass_ignored),
      tags: JSON.parse(instance.tags || '[]'),
      isDefault: true,
      syncedInstances: JSON.parse(instance.synced_instances || '[]'),
    }
  }

  /**
   * Retrieves a specific Radarr instance by ID
   *
   * @param id - ID of the Radarr instance to retrieve
   * @returns Promise resolving to the Radarr instance if found, null otherwise
   */
  async getRadarrInstance(id: number): Promise<RadarrInstance | null> {
    const instance = await this.knex('radarr_instances').where('id', id).first()
    if (!instance) return null
    return {
      id: instance.id,
      name: instance.name,
      baseUrl: instance.base_url,
      apiKey: instance.api_key,
      qualityProfile: instance.quality_profile,
      rootFolder: instance.root_folder,
      bypassIgnored: Boolean(instance.bypass_ignored),
      tags: JSON.parse(instance.tags || '[]'),
      isDefault: Boolean(instance.is_default),
      syncedInstances: JSON.parse(instance.synced_instances || '[]'),
    }
  }

  /**
   * Creates a new Radarr instance in the database
   *
   * @param instance - Radarr instance data excluding ID
   * @returns Promise resolving to the ID of the created instance
   * @throws Error if instance creation fails
   */
  async createRadarrInstance(
    instance: Omit<RadarrInstance, 'id'>,
  ): Promise<number> {
    if (instance.isDefault) {
      await this.knex('radarr_instances')
        .where('is_default', true)
        .update('is_default', false)
    }

    const result = await this.knex('radarr_instances')
      .insert({
        name: instance.name || 'Default Radarr Instance',
        base_url: instance.baseUrl,
        api_key: instance.apiKey,
        quality_profile: instance.qualityProfile,
        root_folder: instance.rootFolder,
        bypass_ignored: instance.bypassIgnored,
        tags: JSON.stringify(instance.tags || []),
        is_default: instance.isDefault ?? false,
        is_enabled: true,
        synced_instances: JSON.stringify(instance.syncedInstances || []),
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('id')

    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error('No ID returned from database')
    }
    const row = result[0]
    if (typeof row !== 'object' || !('id' in row)) {
      throw new Error('Invalid ID returned from database')
    }
    return row.id
  }

  /**
   * Updates an existing Radarr instance
   *
   * @param id - ID of the Radarr instance to update
   * @param updates - Partial Radarr instance data to update
   * @returns Promise resolving to void when complete
   */
  async updateRadarrInstance(
    id: number,
    updates: Partial<RadarrInstance>,
  ): Promise<void> {
    if (updates.isDefault) {
      await this.knex('radarr_instances')
        .whereNot('id', id)
        .where('is_default', true)
        .update('is_default', false)
    }
    await this.knex('radarr_instances')
      .where('id', id)
      .update({
        ...(typeof updates.name !== 'undefined' && { name: updates.name }),
        ...(typeof updates.baseUrl !== 'undefined' && {
          base_url: updates.baseUrl,
        }),
        ...(typeof updates.apiKey !== 'undefined' && {
          api_key: updates.apiKey,
        }),
        ...(typeof updates.qualityProfile !== 'undefined' && {
          quality_profile: updates.qualityProfile,
        }),
        ...(typeof updates.rootFolder !== 'undefined' && {
          root_folder: updates.rootFolder,
        }),
        ...(typeof updates.bypassIgnored !== 'undefined' && {
          bypass_ignored: updates.bypassIgnored,
        }),
        ...(typeof updates.tags !== 'undefined' && {
          tags: JSON.stringify(updates.tags),
        }),
        ...(typeof updates.isDefault !== 'undefined' && {
          is_default: updates.isDefault,
        }),
        ...(typeof updates.syncedInstances !== 'undefined' && {
          synced_instances: JSON.stringify(updates.syncedInstances),
        }),
        updated_at: this.timestamp,
      })
  }

  /**
   * Cleans up references to a deleted Radarr instance
   *
   * Removes the deleted instance ID from synced_instances fields of other instances
   *
   * @param deletedId - ID of the deleted Radarr instance
   * @returns Promise resolving to void when complete
   */
  async cleanupDeletedRadarrInstanceReferences(
    deletedId: number,
  ): Promise<void> {
    try {
      const instances = await this.knex('radarr_instances').select(
        'id',
        'synced_instances',
      )

      for (const instance of instances) {
        try {
          const syncedInstances = JSON.parse(instance.synced_instances || '[]')

          if (
            Array.isArray(syncedInstances) &&
            syncedInstances.includes(deletedId)
          ) {
            const updatedInstances = syncedInstances.filter(
              (id) => id !== deletedId,
            )

            await this.knex('radarr_instances')
              .where('id', instance.id)
              .update({
                synced_instances: JSON.stringify(updatedInstances),
                updated_at: this.timestamp,
              })

            this.log.debug(
              `Removed deleted Radarr instance ${deletedId} from synced_instances of instance ${instance.id}`,
            )
          }
        } catch (parseError) {
          this.log.error(
            `Error parsing synced_instances for Radarr instance ${instance.id}:`,
            parseError,
          )
        }
      }
    } catch (error) {
      this.log.error(
        `Error cleaning up references to deleted Radarr instance ${deletedId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Deletes a Radarr instance and cleans up references to it
   *
   * @param id - ID of the Radarr instance to delete
   * @returns Promise resolving to void when complete
   */
  async deleteRadarrInstance(id: number): Promise<void> {
    try {
      await this.cleanupDeletedRadarrInstanceReferences(id)

      await this.knex('radarr_instances').where('id', id).delete()

      this.log.info(`Deleted Radarr instance ${id} and cleaned up references`)
    } catch (error) {
      this.log.error(`Error deleting Radarr instance ${id}:`, error)
      throw error
    }
  }

  //=============================================================================
  // RADARR GENRE ROUTING
  //=============================================================================

  /**
   * Retrieves all Radarr genre routing rules
   *
   * @returns Promise resolving to an array of all Radarr genre routes
   */
  async getRadarrGenreRoutes(): Promise<RadarrGenreRoute[]> {
    const routes = await this.knex('radarr_genre_routing').select('*')
    return routes.map((route) => ({
      id: route.id,
      radarrInstanceId: route.radarr_instance_id,
      name: route.name,
      genre: route.genre,
      rootFolder: route.root_folder,
      qualityProfile: route.quality_profile,
    }))
  }

  /**
   * Creates a new Radarr genre routing rule
   *
   * @param route - Radarr genre route data excluding ID
   * @returns Promise resolving to the created genre route
   */
  async createRadarrGenreRoute(
    route: Omit<RadarrGenreRoute, 'id'>,
  ): Promise<RadarrGenreRoute> {
    const [createdRoute] = await this.knex('radarr_genre_routing')
      .insert({
        radarr_instance_id: route.radarrInstanceId,
        name: route.name,
        genre: route.genre,
        root_folder: route.rootFolder,
        quality_profile: route.qualityProfile,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning([
        'id',
        'name',
        'radarr_instance_id as radarrInstanceId',
        'genre',
        'root_folder as rootFolder',
        'quality_profile as qualityProfile',
      ])
    return createdRoute
  }

  /**
   * Updates an existing Radarr genre routing rule
   *
   * @param id - ID of the genre route to update
   * @param updates - Partial genre route data to update
   * @returns Promise resolving to void when complete
   */
  async updateRadarrGenreRoute(
    id: number,
    updates: Partial<RadarrGenreRoute>,
  ): Promise<void> {
    await this.knex('radarr_genre_routing')
      .where('id', id)
      .update({
        ...(updates.name && { name: updates.name }),
        ...(updates.genre && { genre: updates.genre }),
        ...(updates.rootFolder && { root_folder: updates.rootFolder }),
        ...(updates.qualityProfile && {
          quality_profile: updates.qualityProfile,
        }),
        updated_at: this.timestamp,
      })
  }

  /**
   * Deletes a Radarr genre routing rule
   *
   * @param id - ID of the genre route to delete
   * @returns Promise resolving to void when complete
   */
  async deleteRadarrGenreRoute(id: number): Promise<void> {
    await this.knex('radarr_genre_routing').where('id', id).delete()
  }

  //=============================================================================
  // WATCHLIST MANAGEMENT
  //=============================================================================

  /**
   * Updates a watchlist item by key with given changes
   *
   * @param key - Unique key of the watchlist item
   * @param updates - Fields to update on the watchlist item
   * @returns Promise resolving to void when complete
   */
  async updateWatchlistItem(
    key: string,
    updates: WatchlistItemUpdate,
  ): Promise<void> {
    try {
      if (key.startsWith('selfRSS_') || key.startsWith('friendsRSS_')) {
        this.log.debug(`Skipping temporary RSS key: ${key}`)
        return
      }

      const item = await this.knex('watchlist_items').where({ key }).first()

      if (!item) {
        this.log.warn(
          `Tried to update non-existent watchlist item with key: ${key}`,
        )
        return
      }

      const {
        radarr_instance_id,
        sonarr_instance_id,
        syncing,
        ...otherUpdates
      } = updates

      if (Object.keys(otherUpdates).length > 0) {
        await this.knex('watchlist_items')
          .where({ key })
          .update({
            ...otherUpdates,
            updated_at: this.timestamp,
          })
      }

      // Handle Radarr instance assignment via junction table
      if (radarr_instance_id !== undefined) {
        if (radarr_instance_id === null) {
          await this.knex('watchlist_radarr_instances')
            .where({ watchlist_id: item.id })
            .delete()
        } else {
          const existingInstanceIds = await this.getWatchlistRadarrInstanceIds(
            item.id,
          )

          if (!existingInstanceIds.includes(radarr_instance_id)) {
            await this.addWatchlistToRadarrInstance(
              item.id,
              radarr_instance_id,
              updates.status || item.status || 'pending',
              true,
              syncing || false,
            )
          } else {
            await this.setPrimaryRadarrInstance(item.id, radarr_instance_id)

            if (syncing !== undefined) {
              await this.updateRadarrSyncingStatus(
                item.id,
                radarr_instance_id,
                syncing ?? false,
              )
            }
          }
        }
      }

      // Handle Sonarr instance assignment via junction table
      if (sonarr_instance_id !== undefined) {
        if (sonarr_instance_id === null) {
          await this.knex('watchlist_sonarr_instances')
            .where({ watchlist_id: item.id })
            .delete()
        } else {
          const existingInstanceIds = await this.getWatchlistSonarrInstanceIds(
            item.id,
          )

          if (!existingInstanceIds.includes(sonarr_instance_id)) {
            await this.addWatchlistToSonarrInstance(
              item.id,
              sonarr_instance_id,
              updates.status || item.status || 'pending',
              true,
              syncing || false,
            )
          } else {
            await this.setPrimarySonarrInstance(item.id, sonarr_instance_id)

            if (syncing !== undefined) {
              await this.updateSonarrSyncingStatus(
                item.id,
                sonarr_instance_id,
                syncing ?? false,
              )
            }
          }
        }
      }
    } catch (error) {
      this.log.error(`Error updating watchlist item ${key}:`, error)
      throw error
    }
  }

  /**
   * Updates watchlist items by GUID
   *
   * @param guid - GUID to match against watchlist item GUIDs array
   * @param updates - Fields to update on matching watchlist items
   * @returns Promise resolving to the number of items updated
   */
  async updateWatchlistItemByGuid(
    guid: string,
    updates: {
      sonarr_instance_id?: number | null
      radarr_instance_id?: number | null
    },
  ): Promise<number> {
    try {
      const items = await this.knex('watchlist_items')
        .whereRaw('json_array_length(guids) > 0')
        .select('id', 'guids')

      const matchingIds = items
        .filter((item) => {
          try {
            const guids = JSON.parse(item.guids || '[]')
            return Array.isArray(guids) && guids.includes(guid)
          } catch (e) {
            this.log.error(`Error parsing GUIDs for item ${item.id}:`, e)
            return false
          }
        })
        .map((item) => item.id)

      if (matchingIds.length === 0) {
        this.log.warn(`No items found with GUID: ${guid}`)
        return 0
      }

      const updateCount = await this.knex('watchlist_items')
        .whereIn('id', matchingIds)
        .update({
          ...updates,
          updated_at: this.timestamp,
        })

      this.log.debug(`Updated ${updateCount} items by GUID ${guid}`)
      return updateCount
    } catch (error) {
      this.log.error(`Error updating items by GUID ${guid}:`, error)
      throw error
    }
  }

  /**
   * Retrieves a watchlist item for a specific user
   *
   * @param userId - ID of the user
   * @param key - Unique key of the watchlist item
   * @returns Promise resolving to the watchlist item if found, undefined otherwise
   */
  async getWatchlistItem(
    userId: number,
    key: string,
  ): Promise<WatchlistItem | undefined> {
    const numericUserId =
      typeof userId === 'object' ? (userId as { id: number }).id : userId

    return await this.knex('watchlist_items')
      .where({
        user_id: numericUserId,
        key,
      })
      .first()
  }

  /**
   * Retrieves multiple watchlist items for multiple users
   *
   * @param userIds - Array of user IDs
   * @param keys - Optional array of watchlist item keys to filter by
   * @returns Promise resolving to an array of matching watchlist items
   */
  async getBulkWatchlistItems(
    userIds: number[],
    keys: string[],
  ): Promise<WatchlistItem[]> {
    const logMessage =
      keys.length > 0
        ? `Checking for existing items with ${userIds.length} users and ${keys.length} keys`
        : `Checking for existing items with ${userIds.length} users (no specific keys)`

    this.log.debug(logMessage)

    // Ensure all userIds are numbers
    const numericUserIds = userIds.map((id) =>
      typeof id === 'object' ? (id as { id: number }).id : id,
    )

    const query = this.knex('watchlist_items').whereIn(
      'user_id',
      numericUserIds,
    )

    if (keys.length > 0) {
      query.whereIn('key', keys)
    }

    const results = await query

    const logContext = {
      query: query.toString(),
      userIds: numericUserIds,
      ...(keys.length > 0 ? { keysCount: keys.length } : {}),
    }

    this.log.debug(
      `Query returned ${results.length} total matches from database`,
      logContext,
    )

    return results.map((row) => ({
      ...row,
      guids: JSON.parse(row.guids || '[]'),
      genres: JSON.parse(row.genres || '[]'),
    }))
  }

  /**
   * Retrieves watchlist items by their keys
   *
   * @param keys - Array of watchlist item keys to retrieve
   * @returns Promise resolving to an array of matching watchlist items
   */
  async getWatchlistItemsByKeys(keys: string[]): Promise<WatchlistItem[]> {
    if (keys.length === 0) {
      return []
    }

    try {
      const items = await this.knex('watchlist_items')
        .whereIn('key', keys)
        .select('*')

      this.log.debug(`Retrieved ${items.length} items by keys`, {
        keyCount: keys.length,
        resultCount: items.length,
      })

      return items
    } catch (error) {
      this.log.error('Error in getWatchlistItemsByKeys', {
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  }

  /**
   * Bulk updates multiple watchlist items
   *
   * @param updates - Array of watchlist item updates with user ID and key
   * @returns Promise resolving to the number of items updated
   */
  async bulkUpdateWatchlistItems(
    updates: Array<{
      userId: number
      key: string
      added?: string
      status?: 'pending' | 'requested' | 'grabbed' | 'notified'
      series_status?: 'continuing' | 'ended'
      movie_status?: 'available' | 'unavailable'
      last_notified_at?: string
      sonarr_instance_id?: number
      radarr_instance_id?: number
    }>,
  ): Promise<number> {
    let updatedCount = 0

    try {
      // Use transaction to ensure all updates are atomic
      await this.knex.transaction(async (trx) => {
        // Process updates in chunks to avoid overwhelming the database
        const chunks = this.chunkArray(updates, 100)

        for (const chunk of chunks) {
          for (const update of chunk) {
            try {
              const { userId, key, ...updateFields } = update

              // Find the current item to update
              const currentItem = await trx('watchlist_items')
                .where({
                  user_id: userId,
                  key: key,
                })
                .select('id', 'status')
                .first()

              if (!currentItem) continue

              // Separate fields for main table vs junction tables
              const mainTableFields: MainTableField = {}
              const junctionFields: JunctionTableField = {}

              // Sort update fields into appropriate categories
              for (const [field, value] of Object.entries(updateFields)) {
                if (
                  field === 'radarr_instance_id' ||
                  field === 'sonarr_instance_id'
                ) {
                  if (
                    value === null ||
                    typeof value === 'number' ||
                    value === undefined
                  ) {
                    junctionFields[field as keyof JunctionTableField] = value
                  } else {
                    const numericValue =
                      typeof value === 'string' ? Number(value) : null
                    junctionFields[field as keyof JunctionTableField] =
                      Number.isNaN(numericValue) ? null : numericValue
                  }
                } else {
                  mainTableFields[field as keyof MainTableField] = value
                }
              }

              // Update main table fields if any
              if (Object.keys(mainTableFields).length > 0) {
                const updated = await trx('watchlist_items')
                  .where({
                    user_id: userId,
                    key: key,
                  })
                  .update({
                    ...mainTableFields,
                    updated_at: this.timestamp,
                  })

                updatedCount += updated > 0 ? 1 : 0
              }

              // Handle Radarr instance junction updates
              if ('radarr_instance_id' in junctionFields) {
                const radarrInstanceId = junctionFields.radarr_instance_id as
                  | number
                  | null
                  | undefined

                if (radarrInstanceId === null) {
                  // Remove all Radarr instances
                  await trx('watchlist_radarr_instances')
                    .where({ watchlist_id: currentItem.id })
                    .delete()
                } else if (radarrInstanceId !== undefined) {
                  // Check if association already exists
                  const existingAssoc = await trx('watchlist_radarr_instances')
                    .where({
                      watchlist_id: currentItem.id,
                      radarr_instance_id: radarrInstanceId,
                    })
                    .first()

                  if (!existingAssoc) {
                    // Create new association
                    await trx('watchlist_radarr_instances').insert({
                      watchlist_id: currentItem.id,
                      radarr_instance_id: radarrInstanceId,
                      status: update.status || currentItem.status,
                      is_primary: true,
                      last_notified_at: update.last_notified_at,
                      created_at: this.timestamp,
                      updated_at: this.timestamp,
                    })

                    // Make sure this is the only primary instance
                    await trx('watchlist_radarr_instances')
                      .where({ watchlist_id: currentItem.id })
                      .whereNot({ radarr_instance_id: radarrInstanceId })
                      .update({
                        is_primary: false,
                        updated_at: this.timestamp,
                      })
                  } else {
                    // Update existing association
                    await trx('watchlist_radarr_instances')
                      .where({
                        watchlist_id: currentItem.id,
                        radarr_instance_id: radarrInstanceId,
                      })
                      .update({
                        status: update.status || existingAssoc.status,
                        is_primary: true,
                        last_notified_at:
                          update.last_notified_at !== undefined
                            ? update.last_notified_at
                            : existingAssoc.last_notified_at,
                        updated_at: this.timestamp,
                      })

                    // Make sure this is the only primary instance
                    await trx('watchlist_radarr_instances')
                      .where({ watchlist_id: currentItem.id })
                      .whereNot({ radarr_instance_id: radarrInstanceId })
                      .update({
                        is_primary: false,
                        updated_at: this.timestamp,
                      })
                  }
                }
              }

              // Handle Sonarr instance junction updates - similar process as Radarr
              if ('sonarr_instance_id' in junctionFields) {
                const sonarrInstanceId = junctionFields.sonarr_instance_id as
                  | number
                  | null
                  | undefined

                if (sonarrInstanceId === null) {
                  await trx('watchlist_sonarr_instances')
                    .where({ watchlist_id: currentItem.id })
                    .delete()
                } else if (sonarrInstanceId !== undefined) {
                  const existingAssoc = await trx('watchlist_sonarr_instances')
                    .where({
                      watchlist_id: currentItem.id,
                      sonarr_instance_id: sonarrInstanceId,
                    })
                    .first()

                  if (!existingAssoc) {
                    await trx('watchlist_sonarr_instances').insert({
                      watchlist_id: currentItem.id,
                      sonarr_instance_id: sonarrInstanceId,
                      status: update.status || currentItem.status,
                      is_primary: true,
                      last_notified_at: update.last_notified_at,
                      created_at: this.timestamp,
                      updated_at: this.timestamp,
                    })

                    await trx('watchlist_sonarr_instances')
                      .where({ watchlist_id: currentItem.id })
                      .whereNot({ sonarr_instance_id: sonarrInstanceId })
                      .update({
                        is_primary: false,
                        updated_at: this.timestamp,
                      })
                  } else {
                    await trx('watchlist_sonarr_instances')
                      .where({
                        watchlist_id: currentItem.id,
                        sonarr_instance_id: sonarrInstanceId,
                      })
                      .update({
                        status: update.status || existingAssoc.status,
                        is_primary: true,
                        last_notified_at:
                          update.last_notified_at !== undefined
                            ? update.last_notified_at
                            : existingAssoc.last_notified_at,
                        updated_at: this.timestamp,
                      })

                    await trx('watchlist_sonarr_instances')
                      .where({ watchlist_id: currentItem.id })
                      .whereNot({ sonarr_instance_id: sonarrInstanceId })
                      .update({
                        is_primary: false,
                        updated_at: this.timestamp,
                      })
                  }
                }
              }

              // Record status change in history if status has changed
              if (update.status && update.status !== currentItem.status) {
                await trx('watchlist_status_history').insert({
                  watchlist_item_id: currentItem.id,
                  status: update.status,
                  timestamp: this.timestamp,
                })

                this.log.debug(
                  `Status change for item ${currentItem.id}: ${currentItem.status} -> ${update.status}`,
                )
              }
            } catch (itemError) {
              this.log.error(`Error updating item ${update.key}:`, itemError)
            }
          }
        }
      })

      return updatedCount
    } catch (error) {
      this.log.error('Error in bulk update of watchlist items:', error)
      throw error
    }
  }

  /**
   * Synchronizes genres from watchlist items to the genres table
   *
   * Extracts all unique genres from watchlist items and ensures they exist
   * in the genres table for use in genre routing.
   *
   * @returns Promise resolving to void when complete
   */
  async syncGenresFromWatchlist(): Promise<void> {
    try {
      // Get all watchlist items that have genres
      const items = await this.knex('watchlist_items')
        .whereNotNull('genres')
        .where('genres', '!=', '[]')
        .select('genres')

      const uniqueGenres = new Set<string>()

      // Extract all unique genres
      for (const row of items) {
        try {
          const parsedGenres = JSON.parse(row.genres || '[]')
          if (Array.isArray(parsedGenres)) {
            for (const genre of parsedGenres) {
              if (typeof genre === 'string' && genre.trim().length > 1) {
                uniqueGenres.add(genre.trim())
              }
            }
          }
        } catch (parseError) {
          this.log.error('Error parsing genres:', parseError)
        }
      }

      // Prepare data for insertion or update
      const genresToInsert = Array.from(uniqueGenres).map((genre) => ({
        name: genre,
        is_custom: false,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      }))

      // Insert genres or update timestamp if they already exist
      if (genresToInsert.length > 0) {
        await this.knex('genres')
          .insert(genresToInsert)
          .onConflict('name')
          .merge(['updated_at'])
      }
    } catch (error) {
      this.log.error('Error syncing genres:', error)
      throw error
    }
  }

  /**
   * Adds a custom genre to the genres table
   *
   * @param name - Name of the genre to add
   * @returns Promise resolving to the ID of the created genre
   * @throws Error if genre already exists
   */
  async addCustomGenre(name: string): Promise<number> {
    const [id] = await this.knex('genres')
      .insert({
        name: name.trim(),
        is_custom: true,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .onConflict('name')
      .ignore()
      .returning('id')

    if (!id) {
      throw new Error('Genre already exists')
    }

    return id
  }

  /**
   * Retrieves all genres from the genres table
   *
   * @returns Promise resolving to array of all genres
   */
  async getAllGenres(): Promise<
    Array<{ id: number; name: string; is_custom: boolean }>
  > {
    return await this.knex('genres')
      .select('id', 'name', 'is_custom')
      .orderBy('name', 'asc')
  }

  /**
   * Deletes a custom genre from the genres table
   *
   * @param id - ID of the genre to delete
   * @returns Promise resolving to true if deleted, false otherwise
   */
  async deleteCustomGenre(id: number): Promise<boolean> {
    const deleted = await this.knex('genres')
      .where({ id, is_custom: true })
      .delete()
    return deleted > 0
  }

  /**
   * Bulk updates the status of show watchlist items
   *
   * @param updates - Array of show status updates
   * @returns Promise resolving to the number of items updated
   */
  async bulkUpdateShowStatuses(
    updates: Array<{
      key: string
      userId: number
      added?: string
      status?: 'pending' | 'requested' | 'grabbed' | 'notified'
      series_status?: 'continuing' | 'ended'
    }>,
  ): Promise<number> {
    try {
      const updatedCount = await this.bulkUpdateWatchlistItems(updates)
      return updatedCount
    } catch (error) {
      this.log.error('Error updating show statuses:', error)
      throw error
    }
  }

  /**
   * Retrieves all show watchlist items
   *
   * @returns Promise resolving to array of all show watchlist items
   */
  async getAllShowWatchlistItems(): Promise<TokenWatchlistItem[]> {
    try {
      const items = await this.knex('watchlist_items')
        .where('type', 'show')
        .select('*')

      return items.map((item) => ({
        ...item,
        guids:
          typeof item.guids === 'string'
            ? JSON.parse(item.guids)
            : item.guids || [],
        genres:
          typeof item.genres === 'string'
            ? JSON.parse(item.genres)
            : item.genres || [],
      }))
    } catch (error) {
      this.log.error('Error fetching show watchlist items:', error)
      throw error
    }
  }

  /**
   * Retrieves all movie watchlist items
   *
   * @returns Promise resolving to array of all movie watchlist items
   */
  async getAllMovieWatchlistItems(): Promise<TokenWatchlistItem[]> {
    try {
      const items = await this.knex('watchlist_items')
        .where('type', 'movie')
        .select('*')

      return items.map((item) => ({
        ...item,
        guids:
          typeof item.guids === 'string'
            ? JSON.parse(item.guids)
            : item.guids || [],
        genres:
          typeof item.genres === 'string'
            ? JSON.parse(item.genres)
            : item.genres || [],
      }))
    } catch (error) {
      this.log.error('Error fetching movie watchlist items:', error)
      throw error
    }
  }

  /**
   * Creates multiple watchlist items in the database
   *
   * @param items - Array of watchlist items to create
   * @param options - Configuration options for how to handle conflicts
   * @returns Promise resolving to void when complete
   */
  async createWatchlistItems(
    items: Omit<WatchlistItem, 'created_at' | 'updated_at'>[],
    options: { onConflict?: 'ignore' | 'merge' } = { onConflict: 'ignore' },
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const chunks = this.chunkArray(items, 250)

      for (const chunk of chunks) {
        try {
          const itemsToInsert = chunk.map((item) => ({
            user_id:
              typeof item.user_id === 'object'
                ? (item.user_id as { id: number }).id
                : item.user_id,
            key: item.key,
            title: item.title,
            type:
              typeof item.type === 'string'
                ? item.type.toLowerCase()
                : item.type,
            thumb: item.thumb,
            guids: JSON.stringify(item.guids || []),
            genres: JSON.stringify(item.genres || []),
            status: item.status || 'pending',
            created_at: this.timestamp,
            updated_at: this.timestamp,
          }))

          const query = trx('watchlist_items').insert(itemsToInsert)

          if (options.onConflict === 'merge') {
            query.onConflict(['user_id', 'key']).merge()
          } else {
            query.onConflict(['user_id', 'key']).ignore()
          }

          await query
        } catch (err) {
          this.log.error(`Error inserting chunk: ${err}`)
          throw err
        }
      }
    })
  }

  /**
   * Helper method to split arrays into smaller chunks for processing
   *
   * @param array - Array to split into chunks
   * @param size - Maximum size of each chunk
   * @returns Array of arrays containing the chunked data
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Returns the current timestamp in ISO format
   */
  private get timestamp() {
    return new Date().toISOString()
  }

  /**
   * Creates temporary RSS items for tracking changes between syncs
   *
   * @param items - Array of temporary RSS items to create
   * @param source - Source of the items ('self' or 'friends')
   * @returns Promise resolving to void when complete
   */
  async createTempRssItems(
    items: Array<{
      title: string
      type: string
      thumb?: string
      guids: string[]
      genres?: string[]
      source: 'self' | 'friends'
    }>,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const chunks = this.chunkArray(items, 250)

      for (const chunk of chunks) {
        await trx('temp_rss_items').insert(
          chunk.map((item) => ({
            ...item,
            guids: JSON.stringify(item.guids),
            genres: item.genres ? JSON.stringify(item.genres) : null,
            created_at: this.timestamp,
          })),
        )
      }
    })
  }

  /**
   * Retrieves temporary RSS items
   *
   * @param source - Optional source filter ('self' or 'friends')
   * @returns Promise resolving to array of temporary RSS items
   */
  async getTempRssItems(source?: 'self' | 'friends'): Promise<
    Array<{
      id: number
      title: string
      type: string
      thumb: string | null
      guids: string[]
      genres: string[]
      source: 'self' | 'friends'
      created_at: string
    }>
  > {
    const query = this.knex('temp_rss_items')
    if (source) {
      query.where({ source })
    }

    const results = await query
    return results.map((row) => ({
      ...row,
      guids: JSON.parse(row.guids),
      genres: row.genres ? JSON.parse(row.genres) : [],
    }))
  }

  /**
   * Deletes specific temporary RSS items by ID
   *
   * @param ids - Array of item IDs to delete
   * @returns Promise resolving to void when complete
   */
  async deleteTempRssItems(ids: number[]): Promise<void> {
    await this.knex('temp_rss_items').whereIn('id', ids).delete()
  }

  /**
   * Deletes all temporary RSS items
   *
   * @param source - Optional source filter ('self' or 'friends')
   * @returns Promise resolving to void when complete
   */
  async deleteAllTempRssItems(source?: 'self' | 'friends'): Promise<void> {
    const query = this.knex('temp_rss_items')
    if (source) {
      query.where({ source })
    }
    await query.delete()
  }

  /**
   * Deletes watchlist items for a specific user
   *
   * @param userId - ID of the user
   * @param keys - Array of watchlist item keys to delete
   * @returns Promise resolving to void when complete
   */
  async deleteWatchlistItems(userId: number, keys: string[]): Promise<void> {
    if (keys.length === 0) return

    const numericUserId =
      typeof userId === 'object' ? (userId as { id: number }).id : userId

    await this.knex('watchlist_items')
      .where('user_id', numericUserId)
      .whereIn('key', keys)
      .delete()
  }

  /**
   * Retrieves all watchlist items for a specific user
   *
   * @param userId - ID of the user
   * @returns Promise resolving to array of all watchlist items for the user
   */
  async getAllWatchlistItemsForUser(userId: number): Promise<WatchlistItem[]> {
    const numericUserId =
      typeof userId === 'object' ? (userId as { id: number }).id : userId

    const items = await this.knex('watchlist_items')
      .where('user_id', numericUserId)
      .select('*')

    return items.map((item) => ({
      ...item,
      guids: JSON.parse(item.guids || '[]'),
      genres: JSON.parse(item.genres || '[]'),
    }))
  }

  //=============================================================================
  // NOTIFICATION PROCESSING
  //=============================================================================

  /**
   * Processes notifications for media items
   *
   * This function evaluates watchlist items that match a media item's GUID,
   * checks notification preferences for each user, and creates notification records.
   * It manages different notification types based on content type (movie/show) and
   * handles both individual episodes and bulk season releases.
   *
   * @param mediaInfo - Information about the media item
   * @param isBulkRelease - Whether this is a bulk release (e.g., full season)
   * @returns Promise resolving to array of notification results
   */
  async processNotifications(
    mediaInfo: {
      type: 'movie' | 'show'
      guid: string
      title: string
      episodes?: SonarrEpisodeSchema[]
    },
    isBulkRelease: boolean,
  ): Promise<NotificationResult[]> {
    // Get all watchlist items matching this guid
    const watchlistItems = await this.getWatchlistItemsByGuid(mediaInfo.guid)
    const notifications: NotificationResult[] = []

    // Process each matching watchlist item
    for (const item of watchlistItems) {
      // Get the user for this watchlist item
      const user = await this.getUser(item.user_id)
      if (!user) continue

      // Skip if user has disabled notifications
      if (!user.notify_discord && !user.notify_email) continue

      // Special handling for ended shows that were already notified (unless bulk release)
      if (
        item.type === 'show' &&
        item.series_status === 'ended' &&
        item.last_notified_at &&
        !isBulkRelease
      ) {
        continue
      }

      // Determine notification type and details
      let contentType: 'movie' | 'season' | 'episode'
      let seasonNumber: number | undefined
      let episodeNumber: number | undefined

      if (mediaInfo.type === 'movie') {
        contentType = 'movie'
      } else if (mediaInfo.type === 'show' && mediaInfo.episodes?.length) {
        if (isBulkRelease) {
          contentType = 'season'
          seasonNumber = mediaInfo.episodes[0].seasonNumber
        } else {
          contentType = 'episode'
          seasonNumber = mediaInfo.episodes[0].seasonNumber
          episodeNumber = mediaInfo.episodes[0].episodeNumber
        }
      } else {
        continue
      }

      // Check for existing notification to avoid duplicates
      const existingNotification = await this.knex('notifications')
        .where({
          user_id: user.id,
          type: contentType,
          watchlist_item_id: item.id,
          notification_status: 'active',
        })
        .modify((query) => {
          if (seasonNumber !== undefined) {
            query.where('season_number', seasonNumber)
          }
          if (episodeNumber !== undefined) {
            query.where('episode_number', episodeNumber)
          }
        })
        .first()

      if (existingNotification) {
        this.log.info(
          `Skipping ${contentType} notification for ${mediaInfo.title}${
            seasonNumber !== undefined ? ` S${seasonNumber}` : ''
          }${
            episodeNumber !== undefined ? `E${episodeNumber}` : ''
          } - already sent previously to user ${user.name}`,
        )
        continue
      }

      // Update the watchlist item's notification status
      await this.knex('watchlist_items').where('id', item.id).update({
        last_notified_at: new Date().toISOString(),
        status: 'notified',
      })

      // Record the status change in history
      await this.knex('watchlist_status_history').insert({
        watchlist_item_id: item.id,
        status: 'notified',
        timestamp: new Date().toISOString(),
      })

      // Prepare notification data
      const notificationTitle = mediaInfo.title || item.title
      const notification: MediaNotification = {
        type: mediaInfo.type,
        title: notificationTitle,
        username: user.name,
        posterUrl: item.thumb || undefined,
      }

      // Convert IDs to numbers
      const userId =
        typeof item.user_id === 'object'
          ? (item.user_id as { id: number }).id
          : Number(item.user_id)

      const itemId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id

      // Create notification record based on content type
      if (contentType === 'movie') {
        await this.createNotificationRecord({
          watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
          user_id: !Number.isNaN(userId) ? userId : null,
          type: 'movie',
          title: notificationTitle,
          sent_to_discord: Boolean(user.notify_discord),
          sent_to_email: Boolean(user.notify_email),
          sent_to_webhook: false,
        })
      } else if (contentType === 'season') {
        notification.episodeDetails = {
          seasonNumber: seasonNumber,
        }

        await this.createNotificationRecord({
          watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
          user_id: !Number.isNaN(userId) ? userId : null,
          type: 'season',
          title: notificationTitle,
          season_number: seasonNumber,
          sent_to_discord: Boolean(user.notify_discord),
          sent_to_email: Boolean(user.notify_email),
          sent_to_webhook: false,
        })
      } else if (
        contentType === 'episode' &&
        mediaInfo.episodes &&
        mediaInfo.episodes.length > 0
      ) {
        const episode = mediaInfo.episodes[0]

        notification.episodeDetails = {
          title: episode.title,
          ...(episode.overview && { overview: episode.overview }),
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          airDateUtc: episode.airDateUtc,
        }

        await this.createNotificationRecord({
          watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
          user_id: !Number.isNaN(userId) ? userId : null,
          type: 'episode',
          title: notificationTitle,
          message: episode.overview,
          season_number: episode.seasonNumber,
          episode_number: episode.episodeNumber,
          sent_to_discord: Boolean(user.notify_discord),
          sent_to_email: Boolean(user.notify_email),
          sent_to_webhook: false,
        })
      }

      // Add to results
      notifications.push({
        user: {
          discord_id: user.discord_id,
          notify_discord: user.notify_discord,
          notify_email: user.notify_email,
          name: user.name,
        },
        notification,
      })
    }

    return notifications
  }

  /**
   * Creates a notification record in the database
   *
   * @param notification - Notification data to create
   * @returns Promise resolving to the ID of the created notification
   */
  async createNotificationRecord(notification: {
    watchlist_item_id: number | null
    user_id: number | null
    type: 'episode' | 'season' | 'movie' | 'watchlist_add'
    title: string
    message?: string
    season_number?: number
    episode_number?: number
    sent_to_discord: boolean
    sent_to_email: boolean
    sent_to_webhook?: boolean
    notification_status?: string
  }): Promise<number> {
    const [id] = await this.knex('notifications')
      .insert({
        ...notification,
        season_number: notification.season_number || null,
        episode_number: notification.episode_number || null,
        notification_status: notification.notification_status || 'active',
        sent_to_webhook: notification.sent_to_webhook || false,
        created_at: this.timestamp,
      })
      .returning('id')

    return id
  }

  /**
   * Checks if a webhook notification exists for a particular item and user
   *
   * This method is used to prevent duplicate webhook notifications when
   * processing watchlist items.
   *
   * @param userId - ID of the user who would receive the notification
   * @param type - Type of notification to check for
   * @param title - Title of the content item
   * @returns Promise resolving to the notification if found, undefined otherwise
   */
  async getExistingWebhookNotification(
    userId: number,
    type: string,
    title: string,
  ): Promise<{ id: number } | undefined> {
    return await this.knex('notifications')
      .where({
        user_id: userId,
        type,
        title,
        sent_to_webhook: true,
      })
      .select('id')
      .first()
  }

  /**
   * Resets notification status for content items
   *
   * @param options - Options for filtering which notifications to reset
   * @returns Promise resolving to the number of notifications reset
   */
  async resetContentNotifications(options: {
    olderThan?: Date
    watchlistItemId?: number
    userId?: number
    contentType?: string
    seasonNumber?: number
    episodeNumber?: number
  }): Promise<number> {
    const query = this.knex('notifications')
      .where('notification_status', 'active')
      .update({
        notification_status: 'reset',
        updated_at: this.timestamp,
      })

    if (options.olderThan) {
      query.where('created_at', '<', options.olderThan.toISOString())
    }

    if (options.watchlistItemId) {
      query.where('watchlist_item_id', options.watchlistItemId)
    }

    if (options.userId) {
      query.where('user_id', options.userId)
    }

    if (options.contentType) {
      query.where('type', options.contentType)
    }

    if (options.seasonNumber !== undefined) {
      query.where('season_number', options.seasonNumber)
    }

    if (options.episodeNumber !== undefined) {
      query.where('episode_number', options.episodeNumber)
    }

    const count = await query
    this.log.info(`Reset ${count} notifications`)
    return count
  }

  /**
   * Retrieves watchlist items that match a specific GUID
   *
   * @param guid - GUID to match against watchlist items
   * @returns Promise resolving to array of matching watchlist items
   */
  async getWatchlistItemsByGuid(guid: string): Promise<TokenWatchlistItem[]> {
    const items = await this.knex('watchlist_items')
      .whereRaw('json_array_length(guids) > 0')
      .select('*')

    return items
      .filter((item) => {
        const guids = JSON.parse(item.guids || '[]')
        return guids.includes(guid)
      })
      .map((item) => ({
        ...item,
        guids: JSON.parse(item.guids || '[]'),
        genres: JSON.parse(item.genres || '[]'),
      }))
  }

  /**
   * Retrieves the top genres across all watchlist items
   *
   * This method aggregates all genres from watchlist items and counts their occurrences,
   * returning the most popular genres. This data is valuable for understanding content
   * preferences across the user base and can inform genre routing rules.
   *
   * The method parses JSON genre arrays from each watchlist item, normalizes them,
   * and tracks occurrence counts in memory before sorting to find the most popular.
   *
   * @param limit - Maximum number of genres to return (default: 10)
   * @returns Promise resolving to array of genres with their occurrence counts
   */
  async getTopGenres(limit = 10): Promise<{ genre: string; count: number }[]> {
    try {
      // First, retrieve all watchlist items that have genre information
      const items = await this.knex('watchlist_items')
        .whereNotNull('genres')
        .where('genres', '!=', '[]')
        .select('genres')

      this.log.debug(`Processing genres from ${items.length} watchlist items`)

      // Count occurrences of each genre
      const genreCounts: Record<string, number> = {}
      for (const item of items) {
        try {
          let genres: string[] = []
          try {
            const parsed = JSON.parse(item.genres)
            if (Array.isArray(parsed)) {
              genres = parsed
            }
          } catch (parseError) {
            this.log.debug('Skipping malformed genres JSON', {
              genres: item.genres,
            })
            continue
          }

          // Increment counts for each genre
          for (const genre of genres) {
            if (typeof genre === 'string' && genre.trim().length > 0) {
              const normalizedGenre = genre.trim()
              genreCounts[normalizedGenre] =
                (genreCounts[normalizedGenre] || 0) + 1
            }
          }
        } catch (err) {
          this.log.error('Error processing genre item:', err)
        }
      }

      // Sort genres by count and limit the results
      const sortedGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)

      this.log.info(
        `Returning ${sortedGenres.length} top genres from ${Object.keys(genreCounts).length} total genres`,
      )
      return sortedGenres
    } catch (error) {
      this.log.error('Error in getTopGenres:', error)
      throw error
    }
  }

  /**
   * Retrieves the most watchlisted shows
   *
   * This query groups show-type watchlist items by their key (unique identifier)
   * and counts how many users have each show in their watchlist. The results are
   * sorted by popularity (count) in descending order.
   *
   * @param limit - Maximum number of shows to return (default: 10)
   * @returns Promise resolving to array of shows with title, count, and thumbnail
   */
  async getMostWatchlistedShows(
    limit = 10,
  ): Promise<{ title: string; count: number; thumb: string | null }[]> {
    const results = await this.knex('watchlist_items')
      .where('type', 'show')
      .select('title', 'thumb')
      .count('* as count')
      .groupBy('key')
      .orderBy('count', 'desc')
      .limit(limit)

    this.log.debug(`Retrieved ${results.length} most watchlisted shows`)

    return results.map((row) => ({
      title: String(row.title),
      count: Number(row.count),
      thumb: row.thumb ? String(row.thumb) : null,
    }))
  }

  /**
   * Retrieves the most watchlisted movies
   *
   * This query groups movie-type watchlist items by their key (unique identifier)
   * and counts how many users have each movie in their watchlist. The results are
   * sorted by popularity (count) in descending order.
   *
   * @param limit - Maximum number of movies to return (default: 10)
   * @returns Promise resolving to array of movies with title, count, and thumbnail
   */
  async getMostWatchlistedMovies(
    limit = 10,
  ): Promise<{ title: string; count: number; thumb: string | null }[]> {
    const results = await this.knex('watchlist_items')
      .where('type', 'movie')
      .select('title', 'thumb')
      .count('* as count')
      .groupBy('key')
      .orderBy('count', 'desc')
      .limit(limit)

    return results.map((row) => ({
      title: String(row.title),
      count: Number(row.count),
      thumb: row.thumb ? String(row.thumb) : null,
    }))
  }

  /**
   * Retrieves users with the most watchlist items
   *
   * This query joins the watchlist_items table with users, then groups by user,
   * counting how many watchlist items each user has. The results provide insights
   * into which users are most actively using the watchlist functionality.
   *
   * @param limit - Maximum number of users to return (default: 10)
   * @returns Promise resolving to array of users with name and item count
   */
  async getUsersWithMostWatchlistItems(
    limit = 10,
  ): Promise<{ name: string; count: number }[]> {
    const results = await this.knex('watchlist_items')
      .join('users', 'watchlist_items.user_id', '=', 'users.id')
      .select('users.name')
      .count('watchlist_items.id as count')
      .groupBy('users.id')
      .orderBy('count', 'desc')
      .limit(limit)

    return results.map((row) => ({
      name: String(row.name),
      count: Number(row.count),
    }))
  }

  /**
   * Retrieves the distribution of watchlist items by status
   *
   * This complex query combines data from both the current status in watchlist_items
   * and the status history in watchlist_status_history. For items with history, it uses
   * the most recent status from history; for those without history, it uses the current status.
   *
   * The implementation uses a subquery to find the latest timestamp for each item in the
   * history table, then joins this with the actual history entries to get the latest status.
   * It then combines these results with items that have no history entries.
   *
   * @returns Promise resolving to array of statuses with their counts
   */
  async getWatchlistStatusDistribution(): Promise<
    { status: string; count: number }[]
  > {
    // First, get items with history and their latest status
    const historyItems = await this.knex
      .select('h.status')
      .count('* as count')
      .from('watchlist_status_history as h')
      .join(
        this.knex
          .select('watchlist_item_id')
          .max('timestamp as latest_timestamp')
          .from('watchlist_status_history')
          .groupBy('watchlist_item_id')
          .as('latest'),
        function () {
          this.on('h.watchlist_item_id', '=', 'latest.watchlist_item_id').andOn(
            'h.timestamp',
            '=',
            'latest.latest_timestamp',
          )
        },
      )
      .groupBy('h.status')
      .orderBy('count', 'desc')

    // Find all item IDs that have history records
    const itemsWithHistory = await this.knex('watchlist_status_history')
      .distinct('watchlist_item_id')
      .pluck('watchlist_item_id')

    // Get items without history and their current status
    const itemsWithoutHistory = await this.knex('watchlist_items')
      .whereNotIn('id', itemsWithHistory)
      .select('status')
      .count('* as count')
      .groupBy('status')
      .orderBy('count', 'desc')

    // Combine both result sets
    const combinedResults = new Map<string, number>()

    // Add items with history
    for (const item of historyItems) {
      combinedResults.set(String(item.status), Number(item.count))
    }

    // Add items without history
    for (const item of itemsWithoutHistory) {
      const status = String(item.status)
      const currentCount = combinedResults.get(status) || 0
      combinedResults.set(status, currentCount + Number(item.count))
    }

    this.log.debug(
      `Calculated status distribution across ${combinedResults.size} statuses`,
    )

    // Convert to array and sort by count
    return Array.from(combinedResults.entries())
      .map(([status, count]) => ({
        status,
        count,
      }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * Retrieves the distribution of watchlist items by content type
   *
   * This query aggregates watchlist items by their type (e.g., movie, show),
   * providing a high-level view of the content distribution across the platform.
   * Types are normalized to lowercase to ensure consistent grouping.
   *
   * @returns Promise resolving to array of content types with their counts
   */
  async getContentTypeDistribution(): Promise<
    { type: string; count: number }[]
  > {
    const results = await this.knex('watchlist_items')
      .select('type')
      .count('* as count')
      .groupBy('type')

    // Normalize type case and combine counts
    const typeMap: Record<string, number> = {}
    for (const row of results) {
      const normalizedType = String(row.type).toLowerCase()
      typeMap[normalizedType] =
        (typeMap[normalizedType] || 0) + Number(row.count)
    }

    this.log.debug(
      `Calculated content type distribution across ${Object.keys(typeMap).length} types`,
    )

    return Object.entries(typeMap).map(([type, count]) => ({
      type,
      count,
    }))
  }

  /**
   * Retrieves recent activity statistics
   *
   * This method provides a summary of system activity over the specified period,
   * including new watchlist items added, status changes recorded, and notifications sent.
   * It queries three different tables and combines the results to give a complete picture
   * of recent system activity.
   *
   * @param days - Number of days to look back (default: 30)
   * @returns Promise resolving to object with activity statistics
   */
  async getRecentActivityStats(days = 30): Promise<{
    new_watchlist_items: number
    status_changes: number
    notifications_sent: number
  }> {
    // Calculate cutoff date for the specified period
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffDateStr = cutoffDate.toISOString()

    this.log.debug(
      `Calculating recent activity stats for period since ${cutoffDateStr}`,
    )

    // New watchlist items in last X days
    const newItems = await this.knex('watchlist_items')
      .where('added', '>=', cutoffDateStr)
      .count('* as count')
      .first()

    // Status changes in last X days - using history table
    const statusChanges = await this.knex('watchlist_status_history')
      .where('timestamp', '>=', cutoffDateStr)
      .count('* as count')
      .first()

    // Notifications in last X days - using the notifications table
    const notifications = await this.knex('notifications')
      .where('created_at', '>=', cutoffDateStr)
      .count('* as count')
      .first()

    const stats = {
      new_watchlist_items: Number(newItems?.count || 0),
      status_changes: Number(statusChanges?.count || 0),
      notifications_sent: Number(notifications?.count || 0),
    }

    this.log.debug('Computed recent activity stats:', stats)

    return stats
  }

  /**
   * Retrieves activity statistics by instance
   *
   * This method provides a comprehensive view of how content is distributed across
   * Sonarr and Radarr instances. It performs two separate queries - one for Sonarr
   * instances and one for Radarr instances - joining the instance tables with the
   * watchlist_items table to count how many items are associated with each instance.
   *
   * The results help identify which instances are most actively used and can inform
   * load balancing decisions or instance management strategies.
   *
   * @returns Promise resolving to array of instance activity statistics
   */
  async getInstanceActivityStats(): Promise<
    {
      instance_id: number
      instance_type: 'sonarr' | 'radarr'
      name: string
      item_count: number
    }[]
  > {
    this.log.debug('Retrieving instance activity statistics')

    // Get statistics for Sonarr instances
    const sonarrResults = await this.knex('watchlist_items')
      .join(
        'sonarr_instances',
        'watchlist_items.sonarr_instance_id',
        '=',
        'sonarr_instances.id',
      )
      .whereNotNull('watchlist_items.sonarr_instance_id')
      .select('sonarr_instances.id as instance_id', 'sonarr_instances.name')
      .count('watchlist_items.id as item_count')
      .groupBy('sonarr_instances.id')

    // Get statistics for Radarr instances
    const radarrResults = await this.knex('watchlist_items')
      .join(
        'radarr_instances',
        'watchlist_items.radarr_instance_id',
        '=',
        'radarr_instances.id',
      )
      .whereNotNull('watchlist_items.radarr_instance_id')
      .select('radarr_instances.id as instance_id', 'radarr_instances.name')
      .count('watchlist_items.id as item_count')
      .groupBy('radarr_instances.id')

    // Format Sonarr results
    const sonarrStats = sonarrResults.map((row) => ({
      instance_id: Number(row.instance_id),
      instance_type: 'sonarr' as const,
      name: String(row.name),
      item_count: Number(row.item_count),
    }))

    // Format Radarr results
    const radarrStats = radarrResults.map((row) => ({
      instance_id: Number(row.instance_id),
      instance_type: 'radarr' as const,
      name: String(row.name),
      item_count: Number(row.item_count),
    }))

    // Combine and sort by item count
    const combinedStats = [...sonarrStats, ...radarrStats].sort(
      (a, b) => b.item_count - a.item_count,
    )

    this.log.debug(
      `Retrieved activity stats for ${sonarrStats.length} Sonarr instances and ${radarrStats.length} Radarr instances`,
    )

    return combinedStats
  }

  /**
   * Retrieves metrics on average time from "grabbed" to "notified" status
   *
   * This complex SQL query analyzes how long it takes for content to move from being
   * initially grabbed to the user being notified about its availability. It uses CTEs
   * (Common Table Expressions) to find the first "grabbed" and "notified" timestamps
   * for each watchlist item, then calculates various statistics based on the time difference.
   *
   * The results are grouped by content type (movie vs. show) to identify differences
   * in processing time between these content categories.
   *
   * This is a critical performance metric for the content delivery pipeline.
   *
   * @returns Promise resolving to array of average time metrics by content type
   */
  async getAverageTimeFromGrabbedToNotified(): Promise<
    {
      content_type: string
      avg_days: number
      min_days: number
      max_days: number
      count: number
    }[]
  > {
    try {
      this.log.debug('Calculating average time from grabbed to notified status')

      // Define type for the raw SQL query result
      type GrabbedToNotifiedRow = {
        content_type: string
        avg_days: number
        min_days: number
        max_days: number
        count: number
      }

      // Execute raw SQL query with CTEs for better performance and readability
      const results = await this.knex.raw<GrabbedToNotifiedRow[]>(`
    WITH grabbed_status AS (
      -- Find the earliest "grabbed" status timestamp for each watchlist item
      SELECT
        h.watchlist_item_id,
        MIN(h.timestamp) AS first_grabbed
      FROM watchlist_status_history h
      WHERE h.status = 'grabbed'
      GROUP BY h.watchlist_item_id
    ),
    notified_status AS (
      -- Find the earliest "notified" status timestamp for each watchlist item
      SELECT
        h.watchlist_item_id,
        MIN(h.timestamp) AS first_notified
      FROM watchlist_status_history h
      WHERE h.status = 'notified'
      GROUP BY h.watchlist_item_id
    )
    -- Join these with watchlist items and calculate time differences
    SELECT
      w.type AS content_type,
      AVG(julianday(n.first_notified) - julianday(g.first_grabbed)) AS avg_days,
      MIN(julianday(n.first_notified) - julianday(g.first_grabbed)) AS min_days,
      MAX(julianday(n.first_notified) - julianday(g.first_grabbed)) AS max_days,
      COUNT(*) AS count
    FROM watchlist_items w
    JOIN grabbed_status g ON w.id = g.watchlist_item_id
    JOIN notified_status n ON w.id = n.watchlist_item_id
    WHERE 
      -- Ensure notified comes after grabbed (no negative times)
      n.first_notified > g.first_grabbed
      -- Filter to just movies and shows
      AND (
        (w.type = 'movie') OR
        (w.type = 'show')
      )
    GROUP BY w.type
  `)

      // Format and return the results
      const formattedResults = results.map((row: GrabbedToNotifiedRow) => ({
        content_type: String(row.content_type),
        avg_days: Number(row.avg_days),
        min_days: Number(row.min_days),
        max_days: Number(row.max_days),
        count: Number(row.count),
      }))

      this.log.debug(
        `Calculated time metrics for ${formattedResults.length} content types`,
      )

      return formattedResults
    } catch (error) {
      this.log.error('Error calculating time from grabbed to notified:', error)
      throw error
    }
  }

  /**
   * Retrieves detailed metrics on all status transitions
   *
   * This comprehensive query analyzes the entire status history to identify direct
   * transitions between different statuses (e.g., from "pending" to "requested" or
   * from "requested" to "grabbed"). For each transition, it calculates statistics
   * on how long these transitions typically take.
   *
   * The implementation uses a complex SQL query with a CTE that identifies consecutive
   * status pairs while filtering out any intermediate statuses.
   *
   * This data provides deep insights into the content processing pipeline and can
   * help identify bottlenecks or anomalies in the workflow.
   *
   * @returns Promise resolving to array of detailed status transition metrics
   */
  async getDetailedStatusTransitionMetrics(): Promise<
    {
      from_status: string
      to_status: string
      content_type: string
      avg_days: number
      min_days: number
      max_days: number
      count: number
    }[]
  > {
    try {
      type TransitionMetricsRow = {
        from_status: string
        to_status: string
        content_type: string
        avg_days: number
        min_days: number
        max_days: number
        count: number
      }

      const results = await this.knex.raw<TransitionMetricsRow[]>(`
      WITH status_pairs AS (
        SELECT 
          h1.status AS from_status,
          h2.status AS to_status,
          w.type AS content_type,
          julianday(h2.timestamp) - julianday(h1.timestamp) AS days_between
        FROM watchlist_status_history h1
        JOIN watchlist_status_history h2 ON h1.watchlist_item_id = h2.watchlist_item_id AND h2.timestamp > h1.timestamp
        JOIN watchlist_items w ON h1.watchlist_item_id = w.id
        WHERE h1.status != h2.status
        AND NOT EXISTS (
          SELECT 1 FROM watchlist_status_history h3
          WHERE h3.watchlist_item_id = h1.watchlist_item_id
          AND h3.timestamp > h1.timestamp AND h3.timestamp < h2.timestamp
        )
      )
      SELECT 
        from_status,
        to_status,
        content_type,
        avg(days_between) AS avg_days,
        min(days_between) AS min_days,
        max(days_between) AS max_days,
        count(*) AS count
      FROM status_pairs
      GROUP BY from_status, to_status, content_type
      ORDER BY from_status, to_status, content_type
    `)

      return results.map((row: TransitionMetricsRow) => ({
        from_status: String(row.from_status),
        to_status: String(row.to_status),
        content_type: String(row.content_type),
        avg_days: Number(row.avg_days),
        min_days: Number(row.min_days),
        max_days: Number(row.max_days),
        count: Number(row.count),
      }))
    } catch (error) {
      this.log.error(
        'Error calculating detailed status transition metrics:',
        error,
      )
      throw error
    }
  }

  /**
   * Retrieves metrics on the average time from addition to availability
   *
   * This analysis measures how long it typically takes for content to become available
   * after being added to a watchlist. For movies, availability is defined by the movie_status
   * field being set to 'available'. For shows, it's defined by the series_status field
   * being set to 'ended'.
   *
   * The implementation uses CTEs to identify the first addition timestamp and the first
   * notification timestamp for each item, then calculates the time difference between them.
   * It filters results to only include items that have reached the availability criteria.
   *
   * This is a key business metric that can help evaluate the overall effectiveness of the
   * content acquisition and delivery pipeline.
   *
   * @returns Promise resolving to array of time-to-availability metrics by content type
   */
  async getAverageTimeToAvailability(): Promise<
    {
      content_type: string
      avg_days: number
      min_days: number
      max_days: number
      count: number
    }[]
  > {
    // Define type for the raw SQL query result
    type AvailabilityStatsRow = {
      content_type: string
      avg_days: number
      min_days: number
      max_days: number
      count: number
    }

    this.log.debug('Calculating average time from addition to availability')

    // Execute raw SQL query with CTEs for first add and first notification timestamps
    const results = await this.knex.raw<AvailabilityStatsRow[]>(`
    WITH first_added AS (
      -- Get initial addition timestamp for each item
      SELECT
        w.id,
        w.type AS content_type,
        w.added
      FROM watchlist_items w
      WHERE w.added IS NOT NULL
    ),
    first_notified AS (
      -- Get first notification timestamp for each item
      SELECT
        h.watchlist_item_id,
        MIN(h.timestamp) AS first_notification
      FROM watchlist_status_history h
      WHERE h.status = 'notified'
      GROUP BY h.watchlist_item_id
    )
    -- Join and calculate statistics on the time difference
    SELECT
      a.content_type,
      AVG(julianday(n.first_notification) - julianday(a.added)) AS avg_days,
      MIN(julianday(n.first_notification) - julianday(a.added)) AS min_days,
      MAX(julianday(n.first_notification) - julianday(a.added)) AS max_days,
      COUNT(*) AS count
    FROM first_added a
    JOIN first_notified n ON a.id = n.watchlist_item_id
    WHERE 
      -- Filter to only include items that have reached availability
      (a.content_type = 'movie' AND EXISTS (
        SELECT 1 FROM watchlist_items w 
        WHERE w.id = a.id AND w.movie_status = 'available'
      ))
      OR 
      (a.content_type = 'show' AND EXISTS (
        SELECT 1 FROM watchlist_items w 
        WHERE w.id = a.id AND w.series_status = 'ended'
      ))
    GROUP BY a.content_type
  `)

    // Format and return the results
    const formattedResults = results.map((row: AvailabilityStatsRow) => ({
      content_type: String(row.content_type),
      avg_days: Number(row.avg_days),
      min_days: Number(row.min_days),
      max_days: Number(row.max_days),
      count: Number(row.count),
    }))

    this.log.debug(
      `Calculated time-to-availability metrics for ${formattedResults.length} content types`,
    )

    return formattedResults
  }

  /**
   * Retrieves data for visualizing status flow (Sankey diagram)
   *
   * This method provides data suitable for creating flow visualizations (e.g., Sankey diagrams)
   * that show how content moves through different statuses in the system. It identifies all
   * direct status transitions and calculates both the count and average time for each transition.
   *
   * The SQL query uses a CTE to identify direct transitions between statuses (with no intermediate
   * statuses) and then aggregates these to provide counts and averages.
   *
   * This visual representation of the content workflow can help identify common paths, bottlenecks,
   * and optimization opportunities in the processing pipeline.
   *
   * @returns Promise resolving to array of status flow data points
   */
  async getStatusFlowData(): Promise<
    {
      from_status: string
      to_status: string
      content_type: string
      count: number
      avg_days: number
    }[]
  > {
    try {
      this.log.debug('Retrieving status flow data for visualization')

      // Define type for the raw SQL query result
      type StatusFlowRow = {
        from_status: string
        to_status: string
        content_type: string
        count: number
        avg_days: number
      }

      // Execute raw SQL query to get status transition data
      const results = await this.knex.raw<StatusFlowRow[]>(`
    WITH status_transitions AS (
      -- For each item, find all pairs of consecutive status changes
      SELECT 
        h1.status AS from_status,
        h2.status AS to_status,
        w.type AS content_type,
        julianday(h2.timestamp) - julianday(h1.timestamp) AS days_between
      FROM watchlist_status_history h1
      JOIN watchlist_status_history h2 ON h1.watchlist_item_id = h2.watchlist_item_id AND h2.timestamp > h1.timestamp
      JOIN watchlist_items w ON h1.watchlist_item_id = w.id
      WHERE h1.status != h2.status
      -- Ensure there are no intermediate status changes
      AND NOT EXISTS (
        SELECT 1 FROM watchlist_status_history h3
        WHERE h3.watchlist_item_id = h1.watchlist_item_id
        AND h3.timestamp > h1.timestamp AND h3.timestamp < h2.timestamp
      )
    )
    -- Aggregate to get counts and average times for each transition type
    SELECT 
      from_status,
      to_status,
      content_type,
      count(*) AS count,
      avg(days_between) AS avg_days
    FROM status_transitions
    GROUP BY from_status, to_status, content_type
    ORDER BY count DESC
  `)

      // Format and return the results
      const formattedResults = results.map((row: StatusFlowRow) => ({
        from_status: String(row.from_status),
        to_status: String(row.to_status),
        content_type: String(row.content_type),
        count: Number(row.count),
        avg_days: Number(row.avg_days),
      }))

      this.log.debug(
        `Retrieved ${formattedResults.length} status flow data points`,
      )

      return formattedResults
    } catch (error) {
      this.log.error('Error calculating status flow data:', error)
      throw error
    }
  }

  /**
   * Retrieves comprehensive notification statistics
   *
   * This method provides detailed analytics on notifications sent through the system,
   * broken down by notification type, delivery channel, and recipient user. It aggregates
   * data from multiple queries to provide a complete picture of notification activity.
   *
   * The implementation uses four separate queries:
   * 1. Total notifications count
   * 2. Breakdown by notification type (movie, episode, season, etc.)
   * 3. Breakdown by delivery channel (discord, email, webhook)
   * 4. Breakdown by recipient user
   *
   * These statistics are valuable for understanding notification patterns and user engagement.
   *
   * @param days - Number of days to look back (default: 30)
   * @returns Promise resolving to object with notification statistics
   */
  async getNotificationStats(days = 30): Promise<{
    total_notifications: number
    by_type: { type: string; count: number }[]
    by_channel: { channel: string; count: number }[]
    by_user: { user_name: string; count: number }[]
  }> {
    // Calculate cutoff date for the specified period
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffDateStr = cutoffDate.toISOString()

    this.log.debug(
      `Gathering notification statistics for past ${days} days (since ${cutoffDateStr})`,
    )

    // Query 1: Total notifications in the period
    const totalQuery = this.knex('notifications')
      .where('created_at', '>=', cutoffDateStr)
      .count('* as count')
      .first()

    // Query 2: Breakdown by notification type
    const byTypeQuery = this.knex('notifications')
      .where('created_at', '>=', cutoffDateStr)
      .select('type')
      .count('* as count')
      .groupBy('type')
      .orderBy('count', 'desc')

    // Query 3: Breakdown by delivery channel (using raw SQL for UNION)
    const byChannelQuery = this.knex.raw<{ channel: string; count: number }[]>(
      `
    -- Count discord notifications
    SELECT 
      'discord' as channel, 
      COUNT(*) as count 
    FROM notifications 
    WHERE created_at >= ? AND sent_to_discord = 1
    
    UNION ALL
    
    -- Count email notifications
    SELECT 
      'email' as channel, 
      COUNT(*) as count 
    FROM notifications 
    WHERE created_at >= ? AND sent_to_email = 1
    
    UNION ALL
    
    -- Count webhook notifications
    SELECT 
      'webhook' as channel, 
      COUNT(*) as count 
    FROM notifications 
    WHERE created_at >= ? AND sent_to_webhook = 1
  `,
      [cutoffDateStr, cutoffDateStr, cutoffDateStr],
    )

    // Query 4: Breakdown by recipient user
    const byUserQuery = this.knex('notifications')
      .join('users', 'notifications.user_id', '=', 'users.id')
      .where('notifications.created_at', '>=', cutoffDateStr)
      .select('users.name as user_name')
      .count('notifications.id as count')
      .groupBy('users.id')
      .orderBy('count', 'desc')

    // Execute all queries in parallel for better performance
    const [total, byType, byChannel, byUser] = await Promise.all([
      totalQuery,
      byTypeQuery,
      byChannelQuery,
      byUserQuery,
    ])

    // Process and format the results
    const stats = {
      total_notifications: Number(total?.count || 0),
      by_type: byType.map((row) => ({
        type: String(row.type),
        count: Number(row.count),
      })),
      by_channel: byChannel.map((row: { channel: string; count: number }) => ({
        channel: String(row.channel),
        count: Number(row.count),
      })),
      by_user: byUser.map((row) => ({
        user_name: String(row.user_name),
        count: Number(row.count),
      })),
    }

    this.log.debug('Notification statistics gathered:', {
      total: stats.total_notifications,
      typeCount: stats.by_type.length,
      channelCount: stats.by_channel.length,
      userCount: stats.by_user.length,
    })

    return stats
  }

  //=============================================================================
  // RADARR JUNCTION TABLE METHODS
  //=============================================================================

  /**
   * Retrieves all Radarr instance IDs associated with a watchlist item
   *
   * This method queries the watchlist_radarr_instances junction table to find
   * all Radarr instances that a particular watchlist item is associated with.
   * This is essential for multi-instance deployments where content may be
   * distributed across several Radarr instances.
   *
   * @param watchlistId - ID of the watchlist item
   * @returns Promise resolving to array of Radarr instance IDs
   */
  async getWatchlistRadarrInstanceIds(watchlistId: number): Promise<number[]> {
    try {
      const result = await this.knex('watchlist_radarr_instances')
        .select('radarr_instance_id')
        .where({ watchlist_id: watchlistId })

      return result.map((r) => r.radarr_instance_id)
    } catch (error) {
      this.log.error(
        `Error getting Radarr instance IDs for watchlist ${watchlistId}:`,
        error,
      )
      return []
    }
  }

  /**
   * Retrieves the instance status for a watchlist item in Radarr
   *
   * Queries the junction table to get detailed status information about how a specific
   * watchlist item is configured in a particular Radarr instance.
   *
   * @param watchlistId - ID of the watchlist item
   * @param instanceId - ID of the Radarr instance
   * @returns Promise resolving to the status information if found, null otherwise
   */
  async getWatchlistRadarrInstanceStatus(
    watchlistId: number,
    instanceId: number,
  ): Promise<WatchlistInstanceStatus | null> {
    try {
      const result = await this.knex('watchlist_radarr_instances')
        .select('status', 'last_notified_at', 'is_primary')
        .where({
          watchlist_id: watchlistId,
          radarr_instance_id: instanceId,
        })
        .first()

      return result || null
    } catch (error) {
      this.log.error(
        `Error getting Radarr instance status for watchlist ${watchlistId}, instance ${instanceId}:`,
        error,
      )
      return null
    }
  }

  async addWatchlistToRadarrInstance(
    watchlistId: number,
    instanceId: number,
    status = 'pending',
    isPrimary = false,
    syncing = false,
  ): Promise<void> {
    try {
      await this.knex('watchlist_radarr_instances').insert({
        watchlist_id: watchlistId,
        radarr_instance_id: instanceId,
        status,
        is_primary: isPrimary,
        syncing,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      this.log.debug(
        `Added watchlist ${watchlistId} to Radarr instance ${instanceId}`,
      )
    } catch (error) {
      this.log.error(
        `Error adding watchlist ${watchlistId} to Radarr instance ${instanceId}:`,
        error,
      )
      throw error
    }
  }

  async updateWatchlistRadarrInstanceStatus(
    watchlistId: number,
    instanceId: number,
    status: string,
    lastNotifiedAt: string | null = null,
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        status,
        updated_at: this.timestamp,
      }

      if (lastNotifiedAt !== undefined) {
        updateData.last_notified_at = lastNotifiedAt
      }

      await this.knex('watchlist_radarr_instances')
        .where({
          watchlist_id: watchlistId,
          radarr_instance_id: instanceId,
        })
        .update(updateData)

      this.log.debug(
        `Updated watchlist ${watchlistId} Radarr instance ${instanceId} status to ${status}`,
      )
    } catch (error) {
      this.log.error(
        `Error updating watchlist ${watchlistId} Radarr instance ${instanceId} status:`,
        error,
      )
      throw error
    }
  }

  async removeWatchlistFromRadarrInstance(
    watchlistId: number,
    instanceId: number,
  ): Promise<void> {
    try {
      await this.knex('watchlist_radarr_instances')
        .where({
          watchlist_id: watchlistId,
          radarr_instance_id: instanceId,
        })
        .delete()

      this.log.debug(
        `Removed watchlist ${watchlistId} from Radarr instance ${instanceId}`,
      )
    } catch (error) {
      this.log.error(
        `Error removing watchlist ${watchlistId} from Radarr instance ${instanceId}:`,
        error,
      )
      throw error
    }
  }

  async setPrimaryRadarrInstance(
    watchlistId: number,
    primaryInstanceId: number,
  ): Promise<void> {
    try {
      await this.knex.transaction(async (trx) => {
        await trx('watchlist_radarr_instances')
          .where({ watchlist_id: watchlistId })
          .update({
            is_primary: false,
            updated_at: this.timestamp,
          })

        await trx('watchlist_radarr_instances')
          .where({
            watchlist_id: watchlistId,
            radarr_instance_id: primaryInstanceId,
          })
          .update({
            is_primary: true,
            updated_at: this.timestamp,
          })
      })

      this.log.debug(
        `Set Radarr instance ${primaryInstanceId} as primary for watchlist ${watchlistId}`,
      )
    } catch (error) {
      this.log.error(
        `Error setting primary Radarr instance for watchlist ${watchlistId}:`,
        error,
      )
      throw error
    }
  }

  //=============================================================================
  // SONARR JUNCTION TABLE METHODS
  //=============================================================================

  /**
   * Retrieves all Sonarr instance IDs associated with a watchlist item
   *
   * This method queries the watchlist_sonarr_instances junction table to find
   * all Sonarr instances that a particular watchlist item is associated with.
   * This is essential for multi-instance deployments where content may be
   * distributed across several Sonarr instances.
   *
   * @param watchlistId - ID of the watchlist item
   * @returns Promise resolving to array of Sonarr instance IDs
   */
  async getWatchlistSonarrInstanceIds(watchlistId: number): Promise<number[]> {
    try {
      const result = await this.knex('watchlist_sonarr_instances')
        .select('sonarr_instance_id')
        .where({ watchlist_id: watchlistId })

      return result.map((r) => r.sonarr_instance_id)
    } catch (error) {
      this.log.error(
        `Error getting Sonarr instance IDs for watchlist ${watchlistId}:`,
        error,
      )
      return []
    }
  }

  /**
   * Retrieves the instance status for a watchlist item in Sonarr
   *
   * Queries the junction table to get detailed status information about how a specific
   * watchlist item is configured in a particular Sonarr instance.
   *
   * @param watchlistId - ID of the watchlist item
   * @param instanceId - ID of the Sonarr instance
   * @returns Promise resolving to the status information if found, null otherwise
   */
  async getWatchlistSonarrInstanceStatus(
    watchlistId: number,
    instanceId: number,
  ): Promise<WatchlistInstanceStatus | null> {
    try {
      const result = await this.knex('watchlist_sonarr_instances')
        .select('status', 'last_notified_at', 'is_primary')
        .where({
          watchlist_id: watchlistId,
          sonarr_instance_id: instanceId,
        })
        .first()

      return result || null
    } catch (error) {
      this.log.error(
        `Error getting Sonarr instance status for watchlist ${watchlistId}, instance ${instanceId}:`,
        error,
      )
      return null
    }
  }

  async addWatchlistToSonarrInstance(
    watchlistId: number,
    instanceId: number,
    status = 'pending',
    isPrimary = false,
    syncing = false,
  ): Promise<void> {
    try {
      await this.knex('watchlist_sonarr_instances').insert({
        watchlist_id: watchlistId,
        sonarr_instance_id: instanceId,
        status,
        is_primary: isPrimary,
        syncing,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })

      this.log.debug(
        `Added watchlist ${watchlistId} to Sonarr instance ${instanceId}`,
      )
    } catch (error) {
      this.log.error(
        `Error adding watchlist ${watchlistId} to Sonarr instance ${instanceId}:`,
        error,
      )
      throw error
    }
  }

  async updateWatchlistSonarrInstanceStatus(
    watchlistId: number,
    instanceId: number,
    status: string,
    lastNotifiedAt: string | null = null,
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        status,
        updated_at: this.timestamp,
      }

      if (lastNotifiedAt !== undefined) {
        updateData.last_notified_at = lastNotifiedAt
      }

      await this.knex('watchlist_sonarr_instances')
        .where({
          watchlist_id: watchlistId,
          sonarr_instance_id: instanceId,
        })
        .update(updateData)

      this.log.debug(
        `Updated watchlist ${watchlistId} Sonarr instance ${instanceId} status to ${status}`,
      )
    } catch (error) {
      this.log.error(
        `Error updating watchlist ${watchlistId} Sonarr instance ${instanceId} status:`,
        error,
      )
      throw error
    }
  }

  async removeWatchlistFromSonarrInstance(
    watchlistId: number,
    instanceId: number,
  ): Promise<void> {
    try {
      await this.knex('watchlist_sonarr_instances')
        .where({
          watchlist_id: watchlistId,
          sonarr_instance_id: instanceId,
        })
        .delete()

      this.log.debug(
        `Removed watchlist ${watchlistId} from Sonarr instance ${instanceId}`,
      )
    } catch (error) {
      this.log.error(
        `Error removing watchlist ${watchlistId} from Sonarr instance ${instanceId}:`,
        error,
      )
      throw error
    }
  }

  async setPrimarySonarrInstance(
    watchlistId: number,
    primaryInstanceId: number,
  ): Promise<void> {
    try {
      await this.knex.transaction(async (trx) => {
        await trx('watchlist_sonarr_instances')
          .where({ watchlist_id: watchlistId })
          .update({
            is_primary: false,
            updated_at: this.timestamp,
          })

        await trx('watchlist_sonarr_instances')
          .where({
            watchlist_id: watchlistId,
            sonarr_instance_id: primaryInstanceId,
          })
          .update({
            is_primary: true,
            updated_at: this.timestamp,
          })
      })

      this.log.debug(
        `Set Sonarr instance ${primaryInstanceId} as primary for watchlist ${watchlistId}`,
      )
    } catch (error) {
      this.log.error(
        `Error setting primary Sonarr instance for watchlist ${watchlistId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Retrieves detailed content distribution statistics across all instances
   *
   * This comprehensive method builds a complete breakdown of how content is distributed
   * across all Sonarr and Radarr instances. For each instance, it provides:
   * - Total number of items
   * - Number of items where this instance is the primary
   * - Distribution of items by status (pending, requested, etc.)
   * - Distribution of items by content type (movies, shows, etc.)
   *
   * The information is valuable for administrators to understand content allocation
   * and load distribution across instances.
   *
   * @returns Promise resolving to object with instance content breakdown statistics
   */
  async getInstanceContentBreakdown(): Promise<{
    success: boolean
    instances: Array<{
      id: number
      name: string
      type: 'sonarr' | 'radarr'
      total_items: number
      by_status: Array<{ status: string; count: number }>
      by_content_type: Array<{ content_type: string; count: number }>
      primary_items: number
    }>
  }> {
    try {
      // Get all Radarr instances
      const radarrInstances = await this.knex('radarr_instances')
        .select('id', 'name')
        .where('is_enabled', true)

      // Get all Sonarr instances
      const sonarrInstances = await this.knex('sonarr_instances')
        .select('id', 'name')
        .where('is_enabled', true)

      const instances = []

      // Process Radarr instances
      for (const instance of radarrInstances) {
        // Get total count
        const totalCount = await this.knex('watchlist_radarr_instances')
          .where('radarr_instance_id', instance.id)
          .count('* as count')
          .first()

        // Get count of primary items
        const primaryCount = await this.knex('watchlist_radarr_instances')
          .where({
            radarr_instance_id: instance.id,
            is_primary: true,
          })
          .count('* as count')
          .first()

        // Get breakdown by status
        const statusBreakdown = await this.knex('watchlist_radarr_instances')
          .select('status')
          .count('* as count')
          .where('radarr_instance_id', instance.id)
          .groupBy('status')

        // Get breakdown by content type (join with watchlist_items)
        const contentTypeBreakdown = await this.knex(
          'watchlist_radarr_instances',
        )
          .join(
            'watchlist_items',
            'watchlist_items.id',
            'watchlist_radarr_instances.watchlist_id',
          )
          .select('watchlist_items.type as content_type')
          .count('* as count')
          .where('watchlist_radarr_instances.radarr_instance_id', instance.id)
          .groupBy('watchlist_items.type')

        instances.push({
          id: instance.id,
          name: instance.name,
          type: 'radarr' as const,
          total_items: Number(totalCount?.count || 0),
          primary_items: Number(primaryCount?.count || 0),
          by_status: statusBreakdown.map((item) => ({
            status: String(item.status),
            count: Number(item.count),
          })),
          by_content_type: contentTypeBreakdown.map((item) => ({
            content_type: String(item.content_type),
            count: Number(item.count),
          })),
        })
      }

      // Process Sonarr instances
      for (const instance of sonarrInstances) {
        // Get total count
        const totalCount = await this.knex('watchlist_sonarr_instances')
          .where('sonarr_instance_id', instance.id)
          .count('* as count')
          .first()

        // Get count of primary items
        const primaryCount = await this.knex('watchlist_sonarr_instances')
          .where({
            sonarr_instance_id: instance.id,
            is_primary: true,
          })
          .count('* as count')
          .first()

        // Get breakdown by status
        const statusBreakdown = await this.knex('watchlist_sonarr_instances')
          .select('status')
          .count('* as count')
          .where('sonarr_instance_id', instance.id)
          .groupBy('status')

        // Get breakdown by content type (join with watchlist_items)
        const contentTypeBreakdown = await this.knex(
          'watchlist_sonarr_instances',
        )
          .join(
            'watchlist_items',
            'watchlist_items.id',
            'watchlist_sonarr_instances.watchlist_id',
          )
          .select('watchlist_items.type as content_type')
          .count('* as count')
          .where('watchlist_sonarr_instances.sonarr_instance_id', instance.id)
          .groupBy('watchlist_items.type')

        instances.push({
          id: instance.id,
          name: instance.name,
          type: 'sonarr' as const,
          total_items: Number(totalCount?.count || 0),
          primary_items: Number(primaryCount?.count || 0),
          by_status: statusBreakdown.map((item) => ({
            status: String(item.status),
            count: Number(item.count),
          })),
          by_content_type: contentTypeBreakdown.map((item) => ({
            content_type: String(item.content_type),
            count: Number(item.count),
          })),
        })
      }

      return {
        success: true,
        instances,
      }
    } catch (error) {
      this.log.error('Error getting instance content breakdown:', error)
      throw error
    }
  }

  /**
   * Updates the syncing status of a watchlist item in Radarr
   *
   * Sets whether the item is currently being synchronized with the Radarr instance,
   * which helps prevent duplicate operations during content updates.
   *
   * @param watchlistId - ID of the watchlist item
   * @param instanceId - ID of the Radarr instance
   * @param syncing - Boolean indicating whether the item is being synced
   * @returns Promise resolving to void when complete
   */
  async updateRadarrSyncingStatus(
    watchlistId: number,
    instanceId: number,
    syncing: boolean,
  ): Promise<void> {
    await this.knex('watchlist_radarr_instances')
      .where({
        watchlist_id: watchlistId,
        radarr_instance_id: instanceId,
      })
      .update({
        syncing,
        updated_at: this.timestamp,
      })
  }

  /**
   * Updates the syncing status of a watchlist item in Sonarr
   *
   * Sets whether the item is currently being synchronized with the Sonarr instance,
   * which helps prevent duplicate operations during content updates.
   *
   * @param watchlistId - ID of the watchlist item
   * @param instanceId - ID of the Sonarr instance
   * @param syncing - Boolean indicating whether the item is being synced
   * @returns Promise resolving to void when complete
   */
  async updateSonarrSyncingStatus(
    watchlistId: number,
    instanceId: number,
    syncing: boolean,
  ): Promise<void> {
    await this.knex('watchlist_sonarr_instances')
      .where({
        watchlist_id: watchlistId,
        sonarr_instance_id: instanceId,
      })
      .update({
        syncing,
        updated_at: this.timestamp,
      })
  }

  /**
   * Checks if a watchlist item is currently syncing with a Radarr instance
   *
   * Determines whether a synchronization operation is in progress for this item,
   * which can be used to prevent concurrent operations that might conflict.
   *
   * @param watchlistId - ID of the watchlist item
   * @param instanceId - ID of the Radarr instance
   * @returns Promise resolving to true if the item is currently syncing, false otherwise
   */
  async isRadarrItemSyncing(
    watchlistId: number,
    instanceId: number,
  ): Promise<boolean> {
    const item = await this.knex('watchlist_radarr_instances')
      .where({
        watchlist_id: watchlistId,
        radarr_instance_id: instanceId,
      })
      .first()

    return item ? Boolean(item.syncing) : false
  }

  /**
   * Checks if a watchlist item is currently syncing with a Sonarr instance
   *
   * Determines whether a synchronization operation is in progress for this item,
   * which can be used to prevent concurrent operations that might conflict.
   *
   * @param watchlistId - ID of the watchlist item
   * @param instanceId - ID of the Sonarr instance
   * @returns Promise resolving to true if the item is currently syncing, false otherwise
   */
  async isSonarrItemSyncing(
    watchlistId: number,
    instanceId: number,
  ): Promise<boolean> {
    const item = await this.knex('watchlist_sonarr_instances')
      .where({
        watchlist_id: watchlistId,
        sonarr_instance_id: instanceId,
      })
      .first()

    return item ? Boolean(item.syncing) : false
  }

  /**
   * Retrieves a Sonarr instance by its unique identifier
   *
   * This method finds a Sonarr instance based on a transformed URL identifier,
   * which allows for instance lookup without knowing the exact ID in the database.
   * The transformation strips protocol and special characters for consistent matching.
   *
   * @param instanceId - Transformed URL identifier of the Sonarr instance
   * @returns Promise resolving to the Sonarr instance if found, null otherwise
   */
  async getSonarrInstanceByIdentifier(
    instanceId: string,
  ): Promise<SonarrInstance | null> {
    const instances = await this.knex('sonarr_instances').select()

    for (const instance of instances) {
      const transformedBaseUrl = instance.base_url
        .replace(/https?:\/\//, '')
        .replace(/[^a-zA-Z0-9]/g, '')

      if (transformedBaseUrl === instanceId) {
        return {
          id: instance.id,
          name: instance.name,
          baseUrl: instance.base_url,
          apiKey: instance.api_key,
          qualityProfile: instance.quality_profile,
          rootFolder: instance.root_folder,
          bypassIgnored: Boolean(instance.bypass_ignored),
          seasonMonitoring: instance.season_monitoring,
          tags: JSON.parse(instance.tags || '[]'),
          isDefault: Boolean(instance.is_default),
          syncedInstances: JSON.parse(instance.synced_instances || '[]'),
        }
      }
    }

    return null
  }

  /**
   * Retrieves a Radarr instance by its unique identifier
   *
   * This method finds a Radarr instance based on a transformed URL identifier,
   * which allows for instance lookup without knowing the exact ID in the database.
   * The transformation strips protocol and special characters for consistent matching.
   *
   * @param instanceId - Transformed URL identifier of the Radarr instance
   * @returns Promise resolving to the Radarr instance if found, null otherwise
   */
  async getRadarrInstanceByIdentifier(
    instanceId: string,
  ): Promise<RadarrInstance | null> {
    const instances = await this.knex('radarr_instances').select()

    for (const instance of instances) {
      const transformedBaseUrl = instance.base_url
        .replace(/https?:\/\//, '')
        .replace(/[^a-zA-Z0-9]/g, '')

      if (transformedBaseUrl === instanceId) {
        return {
          id: instance.id,
          name: instance.name,
          baseUrl: instance.base_url,
          apiKey: instance.api_key,
          qualityProfile: instance.quality_profile,
          rootFolder: instance.root_folder,
          bypassIgnored: Boolean(instance.bypass_ignored),
          tags: JSON.parse(instance.tags || '[]'),
          isDefault: Boolean(instance.is_default),
          syncedInstances: JSON.parse(instance.synced_instances || '[]'),
        }
      }
    }

    return null
  }
}
