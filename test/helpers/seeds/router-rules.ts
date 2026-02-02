import type { Knex } from 'knex'

/**
 * Seed data for router_rules table
 *
 * Schema reference:
 * - id: integer (primary key)
 * - name: string (not null)
 * - type: string (not null) - 'conditional', 'genre', etc.
 * - criteria: jsonb (not null) - condition structure
 * - target_type: string (not null) - 'sonarr' or 'radarr'
 * - target_instance_id: integer (not null)
 * - root_folder: string (nullable)
 * - quality_profile: integer (nullable)
 * - tags: jsonb (default: '[]')
 * - order: integer (default: 50)
 * - enabled: boolean (default: true)
 * - search_on_add: boolean (nullable)
 * - season_monitoring: string (nullable)
 * - series_type: string (nullable)
 * - always_require_approval: boolean (default: false)
 * - bypass_user_quotas: boolean (default: false)
 * - approval_reason: string (nullable)
 * - monitor: string (nullable)
 */
export const SEED_ROUTER_RULES = [
  // Sonarr rule that requires approval for Drama shows
  {
    id: 1,
    name: 'Sonarr Drama Approval',
    type: 'conditional',
    target_type: 'sonarr',
    target_instance_id: 1,
    root_folder: '/data/shows',
    quality_profile: 1,
    tags: JSON.stringify([]),
    order: 50,
    enabled: true,
    search_on_add: true,
    season_monitoring: 'all',
    series_type: 'standard',
    always_require_approval: true,
    bypass_user_quotas: false,
    approval_reason: 'Drama shows require approval',
    criteria: JSON.stringify({
      condition: {
        negate: false,
        operator: 'AND',
        conditions: [
          {
            field: 'genres',
            value: 'Drama',
            negate: false,
            operator: 'contains',
          },
        ],
      },
    }),
  },
  // Radarr rule that requires approval for Drama movies
  {
    id: 2,
    name: 'Radarr Drama Approval',
    type: 'conditional',
    target_type: 'radarr',
    target_instance_id: 1,
    root_folder: '/data/movies',
    quality_profile: 1,
    tags: JSON.stringify([]),
    order: 50,
    enabled: true,
    search_on_add: true,
    always_require_approval: true,
    bypass_user_quotas: false,
    approval_reason: 'Drama movies require approval',
    criteria: JSON.stringify({
      condition: {
        negate: false,
        operator: 'AND',
        conditions: [
          {
            field: 'genres',
            value: 'Drama',
            negate: false,
            operator: 'contains',
          },
        ],
      },
    }),
  },
  // Disabled rule - should not match anything
  {
    id: 3,
    name: 'Disabled Rule',
    type: 'conditional',
    target_type: 'radarr',
    target_instance_id: 1,
    root_folder: '/data/movies',
    quality_profile: 1,
    tags: JSON.stringify([]),
    order: 50,
    enabled: false,
    search_on_add: true,
    always_require_approval: true,
    bypass_user_quotas: false,
    criteria: JSON.stringify({
      condition: {
        negate: false,
        operator: 'AND',
        conditions: [],
      },
    }),
  },
]

/**
 * Seeds the router_rules table
 */
export async function seedRouterRules(knex: Knex): Promise<void> {
  await knex('router_rules').insert(SEED_ROUTER_RULES)

  // Update sqlite_sequence to ensure future auto-increments start after our seed data
  if (SEED_ROUTER_RULES.length > 0) {
    const maxId = Math.max(...SEED_ROUTER_RULES.map((rule) => rule.id))
    await knex.raw(
      `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('router_rules', ?)`,
      [maxId],
    )
  }
}
