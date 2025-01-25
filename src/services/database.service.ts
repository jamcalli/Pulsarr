import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import knex, { type Knex } from 'knex'
import type { Config, User } from '@root/types/config.types.js'
import type { Item as WatchlistItem } from '@root/types/plex.types.js'
import type { AdminUser } from '@schemas/auth/auth.js'

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

    if (config) {
      return {
        ...config,
        plexTokens: JSON.parse(config.plexTokens),
        selfRss: config.selfRss ? JSON.parse(config.selfRss) : undefined,
        friendsRss: config.friendsRss
          ? JSON.parse(config.friendsRss)
          : undefined,
      }
    }
    return undefined
  }

  async createConfig(
    config: Omit<Config, 'created_at' | 'updated_at'>,
  ): Promise<number> {
    const [id] = await this.knex('configs')
      .insert({
        port: config.port,
        plexTokens: JSON.stringify(config.plexTokens),
        selfRss: config.selfRss ? JSON.stringify(config.selfRss) : null,
        friendsRss: config.friendsRss
          ? JSON.stringify(config.friendsRss)
          : null,
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

    if (config.plexTokens)
      updateData.plexTokens = JSON.stringify(config.plexTokens)
    if (config.port) updateData.port = config.port
    if (config.selfRss) updateData.selfRss = JSON.stringify(config.selfRss)
    if (config.friendsRss)
      updateData.friendsRss = JSON.stringify(config.friendsRss)

    const updated = await this.knex('configs').where({ id }).update(updateData)
    return updated > 0
  }

  async getWatchlistItem(
    userId: number,
    key: string,
  ): Promise<WatchlistItem | undefined> {
    return await this.knex('watchlist_items')
      .where({ user_id: userId, key })
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

    const query = this.knex('watchlist_items')
      .whereIn('key', keys)
      .whereIn('user_id', userIds)

    const results = await query

    this.log.info(
      `Query returned ${results.length} total matches from database`,
      {
        query: query.toString(),
        userIds,
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

  async migrateConfigFromEnv(): Promise<void> {
    if (!this.config.initialPlexTokens || !this.config.port) {
      this.log.error('Missing INITIAL_PLEX_TOKENS or PORT in config.')
      process.exit(1)
    }

    const existingConfig = await this.getConfig(1)
    if (existingConfig) {
      this.log.info('Configuration already exists in the database.')
      return
    }

    const plex_tokens = this.config.plexTokens
    const port = this.config.port
    await this.createConfig({ plexTokens: plex_tokens, port: port })
    this.log.info('Configuration migrated from config to database.')
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

    await this.knex('watchlist_items')
      .where('user_id', userId)
      .whereIn('key', keys)
      .delete()
  }

  async getAllWatchlistItemsForUser(userId: number): Promise<WatchlistItem[]> {
    const items = await this.knex('watchlist_items')
      .where('user_id', userId)
      .select('*')

    return items.map((item) => ({
      ...item,
      guids: JSON.parse(item.guids || '[]'),
      genres: JSON.parse(item.genres || '[]'),
    }))
  }
}
