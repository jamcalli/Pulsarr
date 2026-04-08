import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '../..')

// Radarr v6 introduced strict tag validation: ^[a-z0-9-]+$
// Tags with colons are rejected with HTTP 400, so we migrate all
// colon-delimited prefixes to hyphens (e.g. pulsarr:user: -> pulsarr-user-)
export async function up(knex: Knex): Promise<void> {
  const configExists = await knex.schema.hasTable('configs')
  if (!configExists) {
    return
  }

  const isPg = isPostgreSQL(knex)

  await knex.schema.alterTable('configs', (table) => {
    if (isPg) {
      table.jsonb('tagMigration').nullable()
    } else {
      table.json('tagMigration').nullable()
    }
  })

  // Save pre-migration prefix values so the tag migration service can identify
  // which tags need renaming during the first tag sync after upgrade
  const configs = await knex('configs').select(
    'id',
    'tagPrefix',
    'removedTagPrefix',
    'deleteSyncRequiredTagRegex',
  )

  if (configs.length > 0) {
    const config = configs[0]
    const preMigrationData = {
      tagPrefix: config.tagPrefix || 'pulsarr:user',
      removedTagPrefix: config.removedTagPrefix || 'pulsarr:removed',
      migratedAt: new Date().toISOString(),
    }

    try {
      const migrationFile = resolve(
        projectRoot,
        'data',
        '.pulsarr-tag-migration.json',
      )
      await writeFile(migrationFile, JSON.stringify(preMigrationData, null, 2))
    } catch (error) {
      // Non-critical - the file helps the tag service but isn't required
      console.warn(
        'Failed to write pre-migration prefix file:',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  for (const config of configs) {
    const updates: Record<string, string> = {}

    if (config.tagPrefix) {
      const transformed = config.tagPrefix
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')

      if (transformed !== config.tagPrefix) {
        updates.tagPrefix = transformed
      }
    }

    if (config.removedTagPrefix) {
      const transformed = config.removedTagPrefix
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')

      if (transformed !== config.removedTagPrefix) {
        updates.removedTagPrefix = transformed
      }
    }

    if (config.deleteSyncRequiredTagRegex) {
      let transformedRegex = config.deleteSyncRequiredTagRegex

      if (config.tagPrefix) {
        const oldPrefix = config.tagPrefix
        const newPrefix = updates.tagPrefix || config.tagPrefix
        transformedRegex = transformedRegex.replace(
          new RegExp(oldPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          newPrefix,
        )
      }

      if (config.removedTagPrefix) {
        const oldRemovedPrefix = config.removedTagPrefix
        const newRemovedPrefix =
          updates.removedTagPrefix || config.removedTagPrefix
        transformedRegex = transformedRegex.replace(
          new RegExp(
            oldRemovedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'g',
          ),
          newRemovedPrefix,
        )
      }

      // Catch any remaining colon-based patterns (e.g. multi-instance "pulsarr2:removed")
      transformedRegex = transformedRegex.replace(
        /([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)/g,
        '$1-$2',
      )

      if (transformedRegex !== config.deleteSyncRequiredTagRegex) {
        updates.deleteSyncRequiredTagRegex = transformedRegex
      }
    }

    if (Object.keys(updates).length > 0) {
      await knex('configs').where('id', config.id).update(updates)
    }
  }

  // tagMigration column is populated later by the user tag service during
  // the first tag sync, which handles the actual Radarr/Sonarr tag renaming
}

// Prefix transformations are not reverted - there is no practical way to
// restore original case/characters, and reverting would break Radarr v6
export async function down(knex: Knex): Promise<void> {
  const configExists = await knex.schema.hasTable('configs')
  if (!configExists) {
    return
  }

  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tagMigration')
  })
}
