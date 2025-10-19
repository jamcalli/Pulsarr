import { beforeEach, describe, expect, it } from 'vitest'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../helpers/database.js'
import {
  SEED_ADMIN_USERS,
  SEED_CONFIGS,
  SEED_RADARR_INSTANCES,
  SEED_SONARR_INSTANCES,
  SEED_USERS,
  SEED_WATCHLIST_ITEMS,
  seedAll,
} from '../helpers/seeds/index.js'

describe('Database Seeds', () => {
  beforeEach(async () => {
    await initializeTestDatabase()
    await resetDatabase()
  })

  it('should seed all tables successfully', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)

    // Verify users were seeded
    const users = await knex('users').select('*')
    expect(users).toHaveLength(SEED_USERS.length)

    // Verify admin users were seeded
    const adminUsers = await knex('admin_users').select('*')
    expect(adminUsers).toHaveLength(SEED_ADMIN_USERS.length)

    // Verify sonarr instances were seeded
    const sonarrInstances = await knex('sonarr_instances').select('*')
    expect(sonarrInstances).toHaveLength(SEED_SONARR_INSTANCES.length)

    // Verify radarr instances were seeded
    const radarrInstances = await knex('radarr_instances').select('*')
    expect(radarrInstances).toHaveLength(SEED_RADARR_INSTANCES.length)

    // Verify configs were seeded
    const configs = await knex('configs').select('*')
    expect(configs).toHaveLength(SEED_CONFIGS.length)

    // Verify watchlist items were seeded
    const watchlistItems = await knex('watchlist_items').select('*')
    expect(watchlistItems).toHaveLength(SEED_WATCHLIST_ITEMS.length)
  })

  it('should seed users with correct data', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)

    const user = await knex('users').where({ id: 1 }).first()
    expect(user).toBeDefined()
    expect(user.name).toBe('test-user-primary')
    // SQLite returns 1/0 for booleans
    expect(Boolean(user.is_primary_token)).toBe(true)
    expect(Boolean(user.notify_discord)).toBe(true)
  })

  it('should seed admin user with correct data', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)

    const adminUser = await knex('admin_users').where({ id: 1 }).first()
    expect(adminUser).toBeDefined()
    expect(adminUser.username).toBe('testadmin')
    expect(adminUser.role).toBe('admin')
  })

  it('should seed instances with correct data', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)

    const sonarr = await knex('sonarr_instances').where({ id: 1 }).first()
    expect(sonarr).toBeDefined()
    expect(sonarr.name).toBe('Test Sonarr')
    // SQLite returns 1/0 for booleans
    expect(Boolean(sonarr.is_default)).toBe(true)

    const radarr = await knex('radarr_instances').where({ id: 1 }).first()
    expect(radarr).toBeDefined()
    expect(radarr.name).toBe('Test Radarr')
    // SQLite returns 1/0 for booleans
    expect(Boolean(radarr.is_default)).toBe(true)
  })

  it('should seed config with correct data', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)

    const config = await knex('configs').where({ id: 1 }).first()
    expect(config).toBeDefined()
    // SQLite returns 1/0 for booleans
    expect(Boolean(config._isReady)).toBe(true)
    expect(config.logLevel).toBe('silent')
  })

  it('should seed watchlist items with correct data', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)

    const items = await knex('watchlist_items').select('*')
    expect(items).toHaveLength(SEED_WATCHLIST_ITEMS.length)

    // Check a movie item
    const movie = await knex('watchlist_items').where({ id: 1 }).first()
    expect(movie).toBeDefined()
    expect(movie.title).toBe('Night of the Living Dead')
    expect(movie.type).toBe('movie')
    expect(movie.status).toBe('grabbed')
    expect(movie.user_id).toBe(1)

    // Check a show item
    const show = await knex('watchlist_items').where({ id: 6 }).first()
    expect(show).toBeDefined()
    expect(show.title).toBe('Sherlock')
    expect(show.type).toBe('show')
    expect(show.series_status).toBe('ended')
  })
})
