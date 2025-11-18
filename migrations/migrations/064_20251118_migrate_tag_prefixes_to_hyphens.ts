import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * Migrates tag prefixes to use hyphen delimiters for Radarr v6/Sonarr compatibility.
 *
 * Radarr v6 (released September 2024) introduced strict tag validation that only accepts
 * lowercase letters (a-z), numbers (0-9), and hyphens (-). Tags with colons are rejected
 * with HTTP 400 errors. This migration:
 *
 * 1. Adds `tagMigration` JSON column to track per-instance migration status (SQLite and PostgreSQL)
 * 2. Updates existing `tagPrefix` from 'pulsarr:user' to 'pulsarr-user'
 * 3. Updates existing `removedTagPrefix` from 'pulsarr:removed' to 'pulsarr-removed'
 *
 * The actual tag migration (updating tags in Radarr/Sonarr and content) will be performed
 * by the user tag service during the first tag sync after upgrade.
 *
 * @see https://github.com/Radarr/Radarr/commit/62a05e2765ee603fa1a48806f1f20ccc936d8b8c
 */
export async function up(knex: Knex): Promise<void> {
  const configExists = await knex.schema.hasTable('configs')
  if (!configExists) {
    return
  }

  const isPg = isPostgreSQL(knex)

  // 1. Add tagMigration JSON column to track per-instance migration status
  await knex.schema.alterTable('configs', (table) => {
    if (isPg) {
      table.jsonb('tagMigration').nullable()
    } else {
      table.json('tagMigration').nullable()
    }
  })

  // 2. Migrate existing tag prefix values to Radarr v6 compatible format
  // Radarr v6 validation regex: ^[a-z0-9-]+$ (only lowercase, numbers, hyphens)
  const configs = await knex('configs').select(
    'id',
    'tagPrefix',
    'removedTagPrefix',
  )

  for (const config of configs) {
    const updates: Record<string, string> = {}

    // Transform tagPrefix if it contains invalid characters
    if (config.tagPrefix) {
      const transformed = config.tagPrefix
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphen
        .replace(/-+/g, '-') // Collapse multiple hyphens
        .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens

      if (transformed !== config.tagPrefix) {
        updates.tagPrefix = transformed
      }
    }

    // Transform removedTagPrefix if it contains invalid characters
    if (config.removedTagPrefix) {
      const transformed = config.removedTagPrefix
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphen
        .replace(/-+/g, '-') // Collapse multiple hyphens
        .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens

      if (transformed !== config.removedTagPrefix) {
        updates.removedTagPrefix = transformed
      }
    }

    // Apply updates if any transformations were needed
    if (Object.keys(updates).length > 0) {
      await knex('configs').where('id', config.id).update(updates)
    }
  }

  // Note: tagMigration column will be populated by the user tag service
  // during the first tag sync after this migration runs. The service will:
  // - Create new hyphen-based tags in Radarr/Sonarr
  // - Bulk update all content to use new tags
  // - Delete old colon-based tags
  // - Mark each instance as migrated in the tagMigration JSON
}

/**
 * Reverts tag prefix migration and removes the tagMigration tracking column.
 *
 * @remark This does NOT revert transformed prefixes or tags already migrated in Radarr/Sonarr.
 * Since custom prefix values were transformed, we cannot accurately restore originals.
 * Only removes the tagMigration column. Manual prefix restoration would be required.
 */
export async function down(knex: Knex): Promise<void> {
  const configExists = await knex.schema.hasTable('configs')
  if (!configExists) {
    return
  }

  // NOTE: We do NOT revert prefix transformations because:
  // 1. Custom values were transformed and we don't know the original
  // 2. Reverting would break Radarr v6 compatibility again
  // 3. Tags in Radarr/Sonarr may already be migrated

  // Only remove tagMigration tracking column
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tagMigration')
  })
}
