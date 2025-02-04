import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import knex, { type Knex } from 'knex'
import type { Config, User } from '@root/types/config.types.js'
import type { Item as WatchlistItem } from '@root/types/plex.types.js'
import type { AdminUser } from '@schemas/auth/auth.js'
import type {
  SonarrInstance,
  SonarrGenreRoute,
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
      notify_email: Boolean(row.notify_email),
      notify_discord: Boolean(row.notify_discord),
      can_sync: Boolean(row.can_sync),
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
      sonarrTags: JSON.parse(config.sonarrTags || '[]'),
      radarrTags: JSON.parse(config.radarrTags || '[]'),
      // Handle optional RSS fields
      selfRss: config.selfRss || undefined,
      friendsRss: config.friendsRss || undefined,
      // Convert boolean fields
      cookieSecured: Boolean(config.cookieSecured),
      sonarrBypassIgnored: Boolean(config.sonarrBypassIgnored),
      radarrBypassIgnored: Boolean(config.radarrBypassIgnored),
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
        cookieSecret: config.cookieSecret,
        cookieName: config.cookieName,
        cookieSecured: config.cookieSecured,
        logLevel: config.logLevel,
        closeGraceDelay: config.closeGraceDelay,
        rateLimitMax: config.rateLimitMax,
        syncIntervalSeconds: config.syncIntervalSeconds,

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
        if (key === 'selfRss' || key === 'friendsRss') {
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
    // If this is marked as default, clear any existing defaults
    if (instance.isDefault) {
      await this.knex('sonarr_instances')
        .where('is_default', true)
        .update('is_default', false)
    }

    const [id] = await this.knex('sonarr_instances')
      .insert({
        name: instance.name || 'Default Sonarr Instance',
        base_url: instance.baseUrl,
        api_key: instance.apiKey,
        quality_profile: instance.qualityProfile,
        root_folder: instance.rootFolder,
        bypass_ignored: instance.bypassIgnored,
        season_monitoring: instance.seasonMonitoring,
        tags: JSON.stringify(instance.tags || []),
        is_default: instance.isDefault || true,
        is_enabled: true,
        synced_instances: JSON.stringify(instance.syncedInstances || []),
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('id')

    return id
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
        ...(updates.name && { name: updates.name }),
        ...(updates.baseUrl && { base_url: updates.baseUrl }),
        ...(updates.apiKey && { api_key: updates.apiKey }),
        ...(updates.qualityProfile && {
          quality_profile: updates.qualityProfile,
        }),
        ...(updates.rootFolder && { root_folder: updates.rootFolder }),
        ...(typeof updates.bypassIgnored !== 'undefined' && {
          bypass_ignored: updates.bypassIgnored,
        }),
        ...(updates.seasonMonitoring && {
          season_monitoring: updates.seasonMonitoring,
        }),
        ...(updates.tags && { tags: JSON.stringify(updates.tags) }),
        ...(typeof updates.isDefault !== 'undefined' && {
          is_default: updates.isDefault,
        }),
        ...(updates.syncedInstances && {
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
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning([
        'id',
        'name',
        'sonarr_instance_id as sonarrInstanceId',
        'genre',
        'root_folder as rootFolder',
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

    const [id] = await this.knex('radarr_instances')
      .insert({
        name: instance.name || 'Default Radarr Instance',
        base_url: instance.baseUrl,
        api_key: instance.apiKey,
        quality_profile: instance.qualityProfile,
        root_folder: instance.rootFolder,
        bypass_ignored: instance.bypassIgnored,
        tags: JSON.stringify(instance.tags || []),
        is_default: instance.isDefault || true,
        is_enabled: true,
        synced_instances: JSON.stringify(instance.syncedInstances || []),
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning('id')

    return id
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
        ...(updates.name && { name: updates.name }),
        ...(updates.baseUrl && { base_url: updates.baseUrl }),
        ...(updates.apiKey && { api_key: updates.apiKey }),
        ...(updates.qualityProfile && {
          quality_profile: updates.qualityProfile,
        }),
        ...(updates.rootFolder && { root_folder: updates.rootFolder }),
        ...(typeof updates.bypassIgnored !== 'undefined' && {
          bypass_ignored: updates.bypassIgnored,
        }),
        ...(updates.tags && { tags: JSON.stringify(updates.tags) }),
        ...(typeof updates.isDefault !== 'undefined' && {
          is_default: updates.isDefault,
        }),
        ...(updates.syncedInstances && {
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
        created_at: this.timestamp,
        updated_at: this.timestamp,
      })
      .returning([
        'id',
        'name',
        'radarr_instance_id as radarrInstanceId',
        'genre',
        'root_folder as rootFolder',
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
    this.log.info(
      `Checking for existing items with ${userIds.length} users and ${keys.length} keys`,
    )

    if (keys.length === 0) return []

    // Ensure all userIds are numbers
    const numericUserIds = userIds.map((id) =>
      typeof id === 'object' ? (id as { id: number }).id : id,
    )

    const query = this.knex('watchlist_items')
      .whereIn('key', keys)
      .whereIn('user_id', numericUserIds)

    const results = await query

    this.log.info(
      `Query returned ${results.length} total matches from database`,
      {
        query: query.toString(),
        userIds: numericUserIds,
        keysCount: keys.length,
      },
    )

    return results.map((row) => ({
      ...row,
      guids: JSON.parse(row.guids || '[]'),
      genres: JSON.parse(row.genres || '[]'),
    }))
  }

  async bulkUpdateWatchlistItems(
    updates: Array<{
      userId: number
      key: string
      added?: string
      status?: 'pending' | 'requested' | 'grabbed' | 'notified'
      series_status?: 'continuing' | 'ended'
      movie_status?: 'available' | 'unavailable'
    }>,
  ): Promise<number> {
    let updatedCount = 0

    try {
      await this.knex.transaction(async (trx) => {
        const chunks = this.chunkArray(updates, 100)

        for (const chunk of chunks) {
          const results = await Promise.all(
            chunk.map((update) =>
              trx('watchlist_items')
                .where({
                  user_id: update.userId,
                  key: update.key,
                })
                .update({
                  added: update.added,
                  status: update.status,
                  series_status: update.series_status,
                  movie_status: update.movie_status,
                  updated_at: this.timestamp,
                }),
            ),
          )

          updatedCount += results.reduce((sum, result) => sum + result, 0)
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
          for (const genre of parsedGenres) {
            if (genre && typeof genre === 'string') {
              uniqueGenres.add(genre.trim())
            }
          }
        } catch (parseError) {
          this.log.error('Error parsing genres:', parseError)
        }
      }

      const existingGenres = await this.knex('genres').select('name')
      const existingGenreNames = new Set(existingGenres.map((g) => g.name))
      const newGenres = Array.from(uniqueGenres)
        .filter((genre) => !existingGenreNames.has(genre))
        .map((genre) => ({
          name: genre,
          is_custom: false,
          created_at: this.timestamp,
          updated_at: this.timestamp,
        }))

      if (newGenres.length > 0) {
        await this.knex('genres').insert(newGenres).onConflict('name').ignore()
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
            type: item.type,
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
    // Ensure userId is a number
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
}
