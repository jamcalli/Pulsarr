import type { FastifyBaseLogger } from 'fastify'
import type { Knex } from 'knex'
import type { Config, User } from '@root/types/config.types.js'
import type { Item as WatchlistItem } from '@root/types/plex.types.js'

export class DatabaseService {
  constructor(
    private readonly knex: Knex,
    private readonly log: FastifyBaseLogger
  ) {}

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return await this.knex('users')
      .where({ id })
      .first()
  }

  async createUser(user: Omit<User, 'id' | 'created_at'>): Promise<number> {
    const [id] = await this.knex('users')
      .insert(user)
      .returning('id')
    return id
  }

  async updateUser(
    id: number,
    data: Partial<Omit<User, 'id' | 'created_at'>>
  ): Promise<boolean> {
    const updated = await this.knex('users')
      .where({ id })
      .update(data)
    return updated > 0
  }

  // Config operations
  async getConfig(id: number): Promise<Config | undefined> {
    const config = await this.knex('configs')
      .where({ id })
      .first()
    
    if (config) {
      return {
        ...config,
        plexTokens: JSON.parse(config.plexTokens),
        selfRss: config.selfRss ? JSON.parse(config.selfRss) : undefined,
        friendsRss: config.friendsRss ? JSON.parse(config.friendsRss) : undefined
      }
    }
    return undefined
  }

  async createConfig(config: Config): Promise<number> {
    const [id] = await this.knex('configs')
      .insert({
        ...config,
        plexTokens: JSON.stringify(config.plexTokens),
        selfRss: config.selfRss ? JSON.stringify(config.selfRss) : null,
        friendsRss: config.friendsRss ? JSON.stringify(config.friendsRss) : null
      })
      .returning('id')
    
    this.log.info(`Config created with ID: ${id}`)
    return id
  }

  async updateConfig(id: number, config: Partial<Config>): Promise<boolean> {
    const updateData: Record<string, unknown> = {}
    
    if (config.plexTokens) updateData.plexTokens = JSON.stringify(config.plexTokens)
    if (config.port) updateData.port = config.port
    if (config.selfRss) updateData.selfRss = JSON.stringify(config.selfRss)
    if (config.friendsRss) updateData.friendsRss = JSON.stringify(config.friendsRss)

    const updated = await this.knex('configs')
      .where({ id })
      .update(updateData)
    return updated > 0
  }

  // Watchlist operations
  async getWatchlistItem(user: string, key: string): Promise<WatchlistItem | undefined> {
    return await this.knex('watchlist_items')
      .where({ user, key })
      .first()
  }

  async getBulkWatchlistItems(userIds: string[], keys: string[]): Promise<WatchlistItem[]> {
    this.log.info(`Checking for existing items with ${userIds.length} users and ${keys.length} keys`)

    if (keys.length === 0) return []

    const query = this.knex('watchlist_items')
      .whereIn('key', keys)

    if (userIds.length > 0) {
      query.whereIn('user', userIds)
    }

    const results = await query
    this.log.info(`Query returned ${results.length} total matches from database`)
    return results
  }

  async createWatchlistItems(items: WatchlistItem[]): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const chunks = this.chunkArray(items, 1000) // Process in chunks to avoid statement size limits
      
      for (const chunk of chunks) {
        await trx('watchlist_items')
          .insert(chunk.map(item => ({
            ...item,
            guids: JSON.stringify(item.guids),
            genres: JSON.stringify(item.genres)
          })))
          .onConflict(['user', 'key'])
          .ignore()
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

  async migrateConfigFromEnv(): Promise<void> {
    if (!process.env.PLEX_TOKENS || !process.env.PORT) {
      this.log.error('Missing PLEX_TOKENS or PORT in .env file.')
      process.exit(1)
    }

    const existingConfig = await this.getConfig(1)
    if (existingConfig) {
      this.log.info('Configuration already exists in the database.')
      return
    }

    const plexTokens = JSON.parse(process.env.PLEX_TOKENS)
    const port = Number.parseInt(process.env.PORT, 10)
    await this.createConfig({ plexTokens, port })
    this.log.info('Configuration migrated from .env to database.')
  }
}