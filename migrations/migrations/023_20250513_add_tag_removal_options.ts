import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '023_20250513_add_tag_removal_options')) {
    return
  }
  const configExists = await knex.schema.hasTable('configs')

  if (configExists) {
    // camelCase to match existing configs table convention (tagUsersInSonarr, etc.)
    await knex.schema.alterTable('configs', (table) => {
      table.string('removedTagMode').defaultTo('remove')
      table.string('removedTagPrefix').defaultTo('pulsarr:removed')
    })

    const config = await knex('configs').first()

    if (config) {
      const updates: Record<string, string> = {}

      if (config.persistHistoricalTags === true) {
        updates.removedTagMode = 'keep'
      } else {
        updates.removedTagMode = 'remove'
      }

      if (Object.keys(updates).length > 0) {
        await knex('configs').update(updates)
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  const configExists = await knex.schema.hasTable('configs')

  if (configExists) {
    await knex.schema.alterTable('configs', (table) => {
      table.dropColumn('removedTagMode')
      table.dropColumn('removedTagPrefix')
    })
  }
}
