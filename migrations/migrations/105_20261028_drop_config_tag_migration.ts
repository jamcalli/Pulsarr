import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tagMigration')
  })
}

export async function down(knex: Knex): Promise<void> {
  const isPg = isPostgreSQL(knex)

  await knex.schema.alterTable('configs', (table) => {
    if (isPg) {
      table.jsonb('tagMigration').nullable()
    } else {
      table.json('tagMigration').nullable()
    }
  })
}
