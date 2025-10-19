import type { Knex } from 'knex'
import { SEED_CONFIGS, seedConfig } from './config.js'
import {
  SEED_RADARR_INSTANCES,
  SEED_SONARR_INSTANCES,
  seedInstances,
} from './instances.js'
import { SEED_ADMIN_USERS, SEED_USERS, seedUsers } from './users.js'
import { SEED_WATCHLIST_ITEMS, seedWatchlist } from './watchlist.js'

/**
 * Export all seed data for direct access in tests
 */
export {
  SEED_USERS,
  SEED_ADMIN_USERS,
  SEED_SONARR_INSTANCES,
  SEED_RADARR_INSTANCES,
  SEED_CONFIGS,
  SEED_WATCHLIST_ITEMS,
}

/**
 * Export individual seed functions
 */
export { seedUsers, seedInstances, seedConfig, seedWatchlist }

/**
 * Seeds all tables with baseline test data
 * Call this after resetDatabase() in beforeEach hooks
 *
 * @param knex - Knex database connection
 */
export async function seedAll(knex: Knex): Promise<void> {
  await seedConfig(knex)
  await seedUsers(knex)
  await seedInstances(knex)
  await seedWatchlist(knex)
}
