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

export class DatabaseService {
  private readonly knex: Knex

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly config: FastifyInstance['config'],
  ) {
    this.knex = knex(DatabaseService.createKnexConfig(config.dbPath, log))
  }

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

  async close(): Promise<void> {
    await this.knex.destroy()
  }

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

  async getAdminUser(email: string): Promise<AdminUser | undefined> {
    return await this.knex('admin_users')
      .select('id', 'username', 'email', 'password', 'role')
      .where({ email })
      .first()
  }

  async getAdminUserByUsername(
    username: string,
  ): Promise<AdminUser | undefined> {
    return await this.knex('admin_users')
      .select('id', 'username', 'email', 'password', 'role')
      .where({ username })
      .first()
  }

  async hasAdminUsers(): Promise<boolean> {
    const count = await this.knex('admin_users').count('* as count').first()
    return Boolean(count && (count.count as number) > 0)
  }

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

  async deleteSonarrInstance(id: number): Promise<void> {
    await this.knex('sonarr_instances').where('id', id).delete()
  }

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

  async deleteSonarrGenreRoute(id: number): Promise<void> {
    await this.knex('sonarr_genre_routing').where('id', id).delete()
  }

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

  async deleteRadarrInstance(id: number): Promise<void> {
    await this.knex('radarr_instances').where('id', id).delete()
  }

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

  async deleteRadarrGenreRoute(id: number): Promise<void> {
    await this.knex('radarr_genre_routing').where('id', id).delete()
  }

  async updateWatchlistItem(
    key: string,
    updates: {
      sonarr_instance_id?: number | null
      radarr_instance_id?: number | null
    },
  ): Promise<void> {
    await this.knex('watchlist_items')
      .where('key', key)
      .update({
        ...updates,
        updated_at: this.timestamp,
      })
  }

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
      await this.knex.transaction(async (trx) => {
        const chunks = this.chunkArray(updates, 100)

        for (const chunk of chunks) {
          for (const update of chunk) {
            const currentItem = await trx('watchlist_items')
              .where({
                user_id: update.userId,
                key: update.key,
              })
              .select('id', 'status')
              .first()

            if (!currentItem) continue

            const updated = await trx('watchlist_items')
              .where({
                user_id: update.userId,
                key: update.key,
              })
              .update({
                added: update.added,
                status: update.status,
                series_status: update.series_status,
                movie_status: update.movie_status,
                last_notified_at: update.last_notified_at,
                sonarr_instance_id: update.sonarr_instance_id,
                radarr_instance_id: update.radarr_instance_id,
                updated_at: this.timestamp,
              })

            updatedCount += updated

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
          }
        }
      })

      return updatedCount
    } catch (error) {
      this.log.error('Error in bulk update of watchlist items:', error)
      throw error
    }
  }

  async syncGenresFromWatchlist(): Promise<void> {
    try {
      const items = await this.knex('watchlist_items')
        .whereNotNull('genres')
        .where('genres', '!=', '[]')
        .select('genres')

      const uniqueGenres = new Set<string>()

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

      const genresToInsert = Array.from(uniqueGenres).map((genre) => ({
        name: genre,
        is_custom: false,
        created_at: this.timestamp,
        updated_at: this.timestamp,
      }))

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

  async getAllGenres(): Promise<
    Array<{ id: number; name: string; is_custom: boolean }>
  > {
    return await this.knex('genres')
      .select('id', 'name', 'is_custom')
      .orderBy('name', 'asc')
  }

  async deleteCustomGenre(id: number): Promise<boolean> {
    const deleted = await this.knex('genres')
      .where({ id, is_custom: true })
      .delete()
    return deleted > 0
  }

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

  async getAllShowWatchlistItems(): Promise<WatchlistItem[]> {
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

  async getAllMovieWatchlistItems(): Promise<WatchlistItem[]> {
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

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private get timestamp() {
    return new Date().toISOString()
  }

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

  async deleteTempRssItems(ids: number[]): Promise<void> {
    await this.knex('temp_rss_items').whereIn('id', ids).delete()
  }

  async deleteAllTempRssItems(source?: 'self' | 'friends'): Promise<void> {
    const query = this.knex('temp_rss_items')
    if (source) {
      query.where({ source })
    }
    await query.delete()
  }

  async deleteWatchlistItems(userId: number, keys: string[]): Promise<void> {
    if (keys.length === 0) return

    const numericUserId =
      typeof userId === 'object' ? (userId as { id: number }).id : userId

    await this.knex('watchlist_items')
      .where('user_id', numericUserId)
      .whereIn('key', keys)
      .delete()
  }

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

  async processNotifications(
    mediaInfo: {
      type: 'movie' | 'show'
      guid: string
      title: string
      episodes?: SonarrEpisodeSchema[]
    },
    isBulkRelease: boolean,
  ): Promise<NotificationResult[]> {
    const watchlistItems = await this.getWatchlistItemsByGuid(mediaInfo.guid)
    const notifications: NotificationResult[] = []

    for (const item of watchlistItems) {
      const user = await this.getUser(item.user_id)
      if (!user) continue
      if (!user.notify_discord && !user.notify_email) continue

      if (
        item.type === 'show' &&
        item.series_status === 'ended' &&
        item.last_notified_at &&
        !isBulkRelease
      ) {
        continue
      }

      await this.knex('watchlist_items').where('id', item.id).update({
        last_notified_at: new Date().toISOString(),
        status: 'notified',
      })

      await this.knex('watchlist_status_history').insert({
        watchlist_item_id: item.id,
        status: 'notified',
        timestamp: new Date().toISOString(),
      })

      const notificationTitle = mediaInfo.title || item.title
      const notification: MediaNotification = {
        type: mediaInfo.type,
        title: notificationTitle,
        username: user.name,
        posterUrl: item.thumb || undefined,
      }

      const userId =
        typeof item.user_id === 'object'
          ? (item.user_id as { id: number }).id
          : Number(item.user_id)

      const itemId =
        typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id

      if (mediaInfo.type === 'show' && mediaInfo.episodes?.length) {
        if (isBulkRelease) {
          notification.episodeDetails = {
            seasonNumber: mediaInfo.episodes[0].seasonNumber,
          }

          // Create notification record
          await this.createNotificationRecord({
            watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
            user_id: !Number.isNaN(userId) ? userId : null,
            type: 'season',
            title: notificationTitle,
            season_number: mediaInfo.episodes[0].seasonNumber,
            sent_to_discord: Boolean(user.notify_discord),
            sent_to_email: Boolean(user.notify_email),
            sent_to_webhook: false,
          })
        } else {
          notification.episodeDetails = {
            title: mediaInfo.episodes[0].title,
            ...(mediaInfo.episodes[0].overview && {
              overview: mediaInfo.episodes[0].overview,
            }),
            seasonNumber: mediaInfo.episodes[0].seasonNumber,
            episodeNumber: mediaInfo.episodes[0].episodeNumber,
            airDateUtc: mediaInfo.episodes[0].airDateUtc,
          }

          // Create notification record
          await this.createNotificationRecord({
            watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
            user_id: !Number.isNaN(userId) ? userId : null,
            type: 'episode',
            title: notificationTitle,
            message: mediaInfo.episodes[0].overview,
            season_number: mediaInfo.episodes[0].seasonNumber,
            episode_number: mediaInfo.episodes[0].episodeNumber,
            sent_to_discord: Boolean(user.notify_discord),
            sent_to_email: Boolean(user.notify_email),
            sent_to_webhook: false,
          })
        }
      } else if (mediaInfo.type === 'movie') {
        // Create notification record for movie
        await this.createNotificationRecord({
          watchlist_item_id: !Number.isNaN(itemId) ? itemId : null,
          user_id: !Number.isNaN(userId) ? userId : null,
          type: 'movie',
          title: notificationTitle,
          sent_to_discord: Boolean(user.notify_discord),
          sent_to_email: Boolean(user.notify_email),
          sent_to_webhook: false,
        })
      }

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

  async getTopGenres(limit = 10): Promise<{ genre: string; count: number }[]> {
    try {
      const items = await this.knex('watchlist_items')
        .whereNotNull('genres')
        .where('genres', '!=', '[]')
        .select('genres')

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

      const sortedGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)

      return sortedGenres
    } catch (error) {
      this.log.error('Error in getTopGenres:', error)
      throw error
    }
  }

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

    return results.map((row) => ({
      title: String(row.title),
      count: Number(row.count),
      thumb: row.thumb ? String(row.thumb) : null,
    }))
  }

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

  async getWatchlistStatusDistribution(): Promise<
    { status: string; count: number }[]
  > {
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

    const itemsWithHistory = await this.knex('watchlist_status_history')
      .distinct('watchlist_item_id')
      .pluck('watchlist_item_id')

    const itemsWithoutHistory = await this.knex('watchlist_items')
      .whereNotIn('id', itemsWithHistory)
      .select('status')
      .count('* as count')
      .groupBy('status')
      .orderBy('count', 'desc')

    const combinedResults = new Map<string, number>()

    historyItems.forEach((item) => {
      combinedResults.set(String(item.status), Number(item.count))
    })

    itemsWithoutHistory.forEach((item) => {
      const status = String(item.status)
      const currentCount = combinedResults.get(status) || 0
      combinedResults.set(status, currentCount + Number(item.count))
    })

    return Array.from(combinedResults.entries())
      .map(([status, count]) => ({
        status,
        count,
      }))
      .sort((a, b) => b.count - a.count)
  }

  async getContentTypeDistribution(): Promise<
    { type: string; count: number }[]
  > {
    const results = await this.knex('watchlist_items')
      .select('type')
      .count('* as count')
      .groupBy('type')

    const typeMap: Record<string, number> = {}

    for (const row of results) {
      const normalizedType = String(row.type).toLowerCase()
      typeMap[normalizedType] =
        (typeMap[normalizedType] || 0) + Number(row.count)
    }

    return Object.entries(typeMap).map(([type, count]) => ({
      type,
      count,
    }))
  }

  async getRecentActivityStats(days = 30): Promise<{
    new_watchlist_items: number
    status_changes: number
    notifications_sent: number
  }> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffDateStr = cutoffDate.toISOString()

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

    return {
      new_watchlist_items: Number(newItems?.count || 0),
      status_changes: Number(statusChanges?.count || 0),
      notifications_sent: Number(notifications?.count || 0),
    }
  }

  async getInstanceActivityStats(): Promise<
    {
      instance_id: number
      instance_type: 'sonarr' | 'radarr'
      name: string
      item_count: number
    }[]
  > {
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

    const sonarrStats = sonarrResults.map((row) => ({
      instance_id: Number(row.instance_id),
      instance_type: 'sonarr' as const,
      name: String(row.name),
      item_count: Number(row.item_count),
    }))

    const radarrStats = radarrResults.map((row) => ({
      instance_id: Number(row.instance_id),
      instance_type: 'radarr' as const,
      name: String(row.name),
      item_count: Number(row.item_count),
    }))

    return [...sonarrStats, ...radarrStats].sort(
      (a, b) => b.item_count - a.item_count,
    )
  }

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
      const results = await this.knex.raw(`
      WITH grabbed_status AS (
        SELECT
          h.watchlist_item_id,
          MIN(h.timestamp) AS first_grabbed
        FROM watchlist_status_history h
        WHERE h.status = 'grabbed'
        GROUP BY h.watchlist_item_id
      ),
      notified_status AS (
        SELECT
          h.watchlist_item_id,
          MIN(h.timestamp) AS first_notified
        FROM watchlist_status_history h
        WHERE h.status = 'notified'
        GROUP BY h.watchlist_item_id
      )
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
        n.first_notified > g.first_grabbed
        AND (
          (w.type = 'movie') OR
          (w.type = 'show')
        )
      GROUP BY w.type
    `)

      return results.map((row: any) => ({
        content_type: String(row.content_type),
        avg_days: Number(row.avg_days),
        min_days: Number(row.min_days),
        max_days: Number(row.max_days),
        count: Number(row.count),
      }))
    } catch (error) {
      this.log.error('Error calculating time from grabbed to notified:', error)
      throw error
    }
  }

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
      const results = await this.knex.raw(`
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

      return results.map((row: any) => ({
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

  async getAverageTimeToAvailability(): Promise<
    {
      content_type: string
      avg_days: number
      min_days: number
      max_days: number
      count: number
    }[]
  > {
    const results = await this.knex.raw(`
    WITH first_added AS (
      SELECT
        w.id,
        w.type AS content_type,
        w.added
      FROM watchlist_items w
      WHERE w.added IS NOT NULL
    ),
    first_notified AS (
      SELECT
        h.watchlist_item_id,
        MIN(h.timestamp) AS first_notification
      FROM watchlist_status_history h
      WHERE h.status = 'notified'
      GROUP BY h.watchlist_item_id
    )
    SELECT
      a.content_type,
      AVG(julianday(n.first_notification) - julianday(a.added)) AS avg_days,
      MIN(julianday(n.first_notification) - julianday(a.added)) AS min_days,
      MAX(julianday(n.first_notification) - julianday(a.added)) AS max_days,
      COUNT(*) AS count
    FROM first_added a
    JOIN first_notified n ON a.id = n.watchlist_item_id
    WHERE 
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

    return results.map((row: any) => ({
      content_type: String(row.content_type),
      avg_days: Number(row.avg_days),
      min_days: Number(row.min_days),
      max_days: Number(row.max_days),
      count: Number(row.count),
    }))
  }

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
      const results = await this.knex.raw(`
      WITH status_transitions AS (
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
        count(*) AS count,
        avg(days_between) AS avg_days
      FROM status_transitions
      GROUP BY from_status, to_status, content_type
      ORDER BY count DESC
    `)

      return results.map((row: any) => ({
        from_status: String(row.from_status),
        to_status: String(row.to_status),
        content_type: String(row.content_type),
        count: Number(row.count),
        avg_days: Number(row.avg_days),
      }))
    } catch (error) {
      this.log.error('Error calculating status flow data:', error)
      throw error
    }
  }

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
  }): Promise<number> {
    const [id] = await this.knex('notifications')
      .insert({
        ...notification,
        sent_to_webhook: notification.sent_to_webhook || false,
        created_at: this.timestamp,
      })
      .returning('id')

    return id
  }

  async getNotificationStats(days = 30): Promise<{
    total_notifications: number
    by_type: { type: string; count: number }[]
    by_channel: { channel: string; count: number }[]
    by_user: { user_name: string; count: number }[]
  }> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffDateStr = cutoffDate.toISOString()

    const totalQuery = this.knex('notifications')
      .where('created_at', '>=', cutoffDateStr)
      .count('* as count')
      .first()

    const byTypeQuery = this.knex('notifications')
      .where('created_at', '>=', cutoffDateStr)
      .select('type')
      .count('* as count')
      .groupBy('type')
      .orderBy('count', 'desc')

    const byChannelQuery = this.knex.raw(
      `
      SELECT 
        'discord' as channel, 
        COUNT(*) as count 
      FROM notifications 
      WHERE created_at >= ? AND sent_to_discord = 1
      UNION ALL
      SELECT 
        'email' as channel, 
        COUNT(*) as count 
      FROM notifications 
      WHERE created_at >= ? AND sent_to_email = 1
      UNION ALL
      SELECT 
        'webhook' as channel, 
        COUNT(*) as count 
      FROM notifications 
      WHERE created_at >= ? AND sent_to_webhook = 1
    `,
      [cutoffDateStr, cutoffDateStr, cutoffDateStr],
    )

    const byUserQuery = this.knex('notifications')
      .join('users', 'notifications.user_id', '=', 'users.id')
      .where('notifications.created_at', '>=', cutoffDateStr)
      .select('users.name as user_name')
      .count('notifications.id as count')
      .groupBy('users.id')
      .orderBy('count', 'desc')

    const [total, byType, byChannel, byUser] = await Promise.all([
      totalQuery,
      byTypeQuery,
      byChannelQuery,
      byUserQuery,
    ])

    return {
      total_notifications: Number(total?.count || 0),
      by_type: byType.map((row) => ({
        type: String(row.type),
        count: Number(row.count),
      })),
      by_channel: byChannel.map((row: any) => ({
        channel: String(row.channel),
        count: Number(row.count),
      })),
      by_user: byUser.map((row) => ({
        user_name: String(row.user_name),
        count: Number(row.count),
      })),
    }
  }
}
