import type { Knex } from 'knex'
import { SEED_CONFIGS, seedConfig } from './config.js'
import {
  SEED_RADARR_INSTANCES,
  SEED_SONARR_INSTANCES,
  seedInstances,
} from './instances.js'
import { SEED_ROUTER_RULES, seedRouterRules } from './router-rules.js'
import { SEED_ADMIN_USERS, SEED_USERS, seedUsers } from './users.js'
import { SEED_WATCHLIST_ITEMS, seedWatchlist } from './watchlist.js'

/**
 * Export seed data and individual seed functions for direct access in tests
 */
export {
  SEED_ADMIN_USERS,
  SEED_CONFIGS,
  SEED_RADARR_INSTANCES,
  SEED_ROUTER_RULES,
  SEED_SONARR_INSTANCES,
  SEED_USERS,
  SEED_WATCHLIST_ITEMS,
  seedConfig,
  seedInstances,
  seedRouterRules,
  seedUsers,
  seedWatchlist,
}

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
  await seedRouterRules(knex)
}
