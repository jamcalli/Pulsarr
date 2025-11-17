import type { Knex } from 'knex'

/**
 * Seed data for sonarr_instances table
 *
 * Schema reference:
 * - id: integer (primary key)
 * - name: string (not null, unique)
 * - base_url: string (not null)
 * - api_key: string (not null)
 * - quality_profile: string (nullable)
 * - root_folder: string (nullable)
 * - bypass_ignored: boolean (default: false)
 * - season_monitoring: string (default: 'all')
 * - monitor_new_items: enum (default: 'all')
 * - search_on_add: boolean (default: true)
 * - tags: jsonb (default: '[]')
 * - is_default: boolean (default: false)
 * - is_enabled: boolean (default: true)
 * - synced_instances: jsonb (default: '[]')
 * - series_type: enum (default: 'standard')
 * - create_season_folders: boolean (default: false)
 * - created_at: timestamp
 * - updated_at: timestamp
 */
export const SEED_SONARR_INSTANCES = [
  {
    id: 1,
    name: 'Test Sonarr',
    base_url: 'http://test-sonarr:8989',
    api_key: 'test_sonarr_api_key_1234567890abcdef',
    quality_profile: '1',
    root_folder: '/data/shows',
    bypass_ignored: false,
    season_monitoring: 'all',
    monitor_new_items: 'all',
    search_on_add: true,
    // For SQLite compatibility: JSON must be stringified
    tags: JSON.stringify([]),
    is_default: true,
    is_enabled: true,
    synced_instances: JSON.stringify([]),
    series_type: 'standard',
    create_season_folders: false,
  },
]

/**
 * Seed data for radarr_instances table
 *
 * Schema reference:
 * - id: integer (primary key)
 * - name: string (not null, unique)
 * - base_url: string (not null)
 * - api_key: string (not null)
 * - quality_profile: string (nullable)
 * - root_folder: string (nullable)
 * - bypass_ignored: boolean (default: false)
 * - search_on_add: boolean (default: true)
 * - minimum_availability: enum (default: 'released')
 * - tags: jsonb (default: '[]')
 * - is_default: boolean (default: false)
 * - is_enabled: boolean (default: true)
 * - synced_instances: jsonb (default: '[]')
 * - created_at: timestamp
 * - updated_at: timestamp
 */
export const SEED_RADARR_INSTANCES = [
  {
    id: 1,
    name: 'Test Radarr',
    base_url: 'http://test-radarr:7878',
    api_key: 'test_radarr_api_key_1234567890abcdef',
    quality_profile: '1',
    root_folder: '/data/movies',
    bypass_ignored: false,
    search_on_add: true,
    minimum_availability: 'announced',
    // For SQLite compatibility: JSON must be stringified
    tags: JSON.stringify([]),
    is_default: true,
    is_enabled: true,
    synced_instances: JSON.stringify([]),
  },
]

/**
 * Seeds the sonarr_instances and radarr_instances tables
 */
export async function seedInstances(knex: Knex): Promise<void> {
  await knex('sonarr_instances').insert(SEED_SONARR_INSTANCES)

  // Update sqlite_sequence for sonarr_instances
  const maxSonarrId = Math.max(...SEED_SONARR_INSTANCES.map((i) => i.id))
  await knex.raw(
    `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('sonarr_instances', ?)`,
    [maxSonarrId],
  )

  await knex('radarr_instances').insert(SEED_RADARR_INSTANCES)

  // Update sqlite_sequence for radarr_instances
  const maxRadarrId = Math.max(...SEED_RADARR_INSTANCES.map((i) => i.id))
  await knex.raw(
    `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('radarr_instances', ?)`,
    [maxRadarrId],
  )
}
