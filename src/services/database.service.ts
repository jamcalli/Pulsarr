import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import knex, { type Knex } from 'knex'
import type { Config, User } from '@root/types/config.types.js'
import type { Item as WatchlistItem } from '@root/types/plex.types.js'

export class DatabaseService {
  private readonly knex: Knex

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly config: FastifyInstance['config']
  ) {
    this.knex = knex(DatabaseService.createKnexConfig(config.DB_PATH, log))
  }

  private static createKnexConfig(dbPath: string, log: FastifyBaseLogger): Knex.Config {
    return {
      client: 'better-sqlite3',
      connection: {
        filename: dbPath
      },
      useNullAsDefault: true,
      pool: { 
        min: 1, 
        max: 1
      },
      log: {
        warn: (message: string) => log.warn(message),
        error: (message: string | Error) => {
          log.error(
            message instanceof Error 
              ? message.message 
              : message
          )
        },
        debug: (message: string) => log.debug(message)
      },
      debug: false
    }
  }

  // Add method to close database connection
  async close(): Promise<void> {
    await this.knex.destroy()
  }

  async createUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const [id] = await this.knex('users')
      .insert({
        ...userData,
        created_at: this.timestamp,
        updated_at: this.timestamp
      })
      .returning('id');

    if (!id) throw new Error('Failed to create user');

    const user: User = {
      ...userData,
      id
    };

    return user;
  }

  async getUser(identifier: number | string): Promise<User | undefined> {
    const row = await this.knex('users')
      .where(typeof identifier === 'number' ? { id: identifier } : { name: identifier })
      .first();
      
    if (!row) return undefined;
    
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      notify_email: Boolean(row.notify_email),
      notify_discord: Boolean(row.notify_discord),
      can_sync: Boolean(row.can_sync)
    } satisfies User;
  }

  async updateUser(
    id: number,
    data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<boolean> {
    const updated = await this.knex('users')
      .where({ id })
      .update({
        ...data,
        updated_at: this.timestamp
      })
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

  async createConfig(config: Omit<Config, 'created_at' | 'updated_at'>): Promise<number> {
    const [id] = await this.knex('configs')
      .insert({
        ...config,
        plexTokens: JSON.stringify(config.plexTokens),
        selfRss: config.selfRss ? JSON.stringify(config.selfRss) : null,
        friendsRss: config.friendsRss ? JSON.stringify(config.friendsRss) : null,
        created_at: this.timestamp,
        updated_at: this.timestamp
      })
      .returning('id')
    
    this.log.info(`Config created with ID: ${id}`)
    return id
  }

  async updateConfig(id: number, config: Partial<Config>): Promise<boolean> {
    const updateData: Record<string, unknown> = {
      updated_at: this.timestamp
    }
    
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
  async getWatchlistItem(userId: number, key: string): Promise<WatchlistItem | undefined> {
    return await this.knex('watchlist_items')
      .where({ user_id: userId, key })
      .first()
  }

  async getBulkWatchlistItems(userIds: number[], keys: string[]): Promise<WatchlistItem[]> {
    this.log.info(`Checking for existing items with ${userIds.length} users and ${keys.length} keys`);
  
    if (keys.length === 0) return [];
  
    const query = this.knex('watchlist_items')
      .whereIn('key', keys)
      .whereIn('user_id', userIds); 
  
    const results = await query;
    
    this.log.info(`Query returned ${results.length} total matches from database`, {
      query: query.toString(),
      userIds,
      keysCount: keys.length
    });
  
    return results.map(row => ({
      ...row,
      guids: JSON.parse(row.guids || '[]'),
      genres: JSON.parse(row.genres || '[]')
    }));
  }

  async createWatchlistItems(items: Omit<WatchlistItem, 'created_at' | 'updated_at'>[], options: { onConflict?: 'ignore' | 'merge' } = { onConflict: 'ignore' }): Promise<void> {
    await this.knex.transaction(async (trx) => {
      const chunks = this.chunkArray(items, 250);
      
      for (const chunk of chunks) {
        try {
          const itemsToInsert = chunk.map(item => ({
            user_id: typeof item.user_id === 'object' ? (item.user_id as { id: number }).id : item.user_id,
            key: item.key,
            title: item.title,
            type: item.type,
            thumb: item.thumb,
            guids: JSON.stringify(item.guids || []),
            genres: JSON.stringify(item.genres || []),
            sync: item.status || 'pending',
            created_at: this.timestamp,
            updated_at: this.timestamp
          }));
  
          const query = trx('watchlist_items')
            .insert(itemsToInsert);
  
          if (options.onConflict === 'merge') {
            query.onConflict(['user_id', 'key']).merge();
          } else {
            query.onConflict(['user_id', 'key']).ignore();
          }
          
          await query;
        } catch (err) {
          this.log.error(`Error inserting chunk: ${err}`);
          throw err;
        }
      }
    });
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
    if (!this.config.INITIAL_PLEX_TOKENS || !this.config.PORT) {
      this.log.error('Missing INITIAL_PLEX_TOKENS or PORT in config.')
      process.exit(1)
    }

    const existingConfig = await this.getConfig(1)
    if (existingConfig) {
      this.log.info('Configuration already exists in the database.')
      return
    }

    const plexTokens = this.config.userConfig.plexTokens
    const port = this.config.PORT
    await this.createConfig({ plexTokens, port })
    this.log.info('Configuration migrated from config to database.')
  }

  async getRssPendingUser(): Promise<User> {
    const user = await this.getUser('rss_pending_match');
    if (!user) throw new Error('RSS pending user not found');
    return user;
  }

  async getPendingRssItems(): Promise<WatchlistItem[]> {
    return this.knex('watchlist_items')
      .where('key', 'like', 'rss_temp_%')
      .select('*');
  }

  async deletePendingRssItems(): Promise<void> {
    const deleted = await this.knex('watchlist_items')
      .where('key', 'like', 'rss_temp_%')
      .delete();
    
    this.log.info(`Deleted ${deleted} pending RSS items`);
  }

}