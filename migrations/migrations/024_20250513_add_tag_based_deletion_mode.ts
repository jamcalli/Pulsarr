import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '024_20250513_add_tag_based_deletion_mode')
  ) {
    return
  }
  const configExists = await knex.schema.hasTable('configs')

  if (configExists) {
    await knex.schema.alterTable('configs', (table) => {
      table.string('deletionMode').defaultTo('watchlist')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  const configExists = await knex.schema.hasTable('configs')

  if (configExists) {
    await knex.schema.alterTable('configs', (table) => {
      table.dropColumn('deletionMode')
    })
  }
}
