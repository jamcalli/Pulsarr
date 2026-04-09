import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '017-20250428_extend_user_tagging')) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('cleanupOrphanedTags').defaultTo(true)
    table.boolean('persistHistoricalTags').defaultTo(false)
    table.string('tagPrefix').defaultTo('pulsarr:user')
  })

  await knex('configs')
    .whereNull('cleanupOrphanedTags')
    .update({ cleanupOrphanedTags: true })

  await knex('configs')
    .whereNull('persistHistoricalTags')
    .update({ persistHistoricalTags: false })

  await knex('configs')
    .whereNull('tagPrefix')
    .update({ tagPrefix: 'pulsarr:user' })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('cleanupOrphanedTags')
    table.dropColumn('persistHistoricalTags')
    table.dropColumn('tagPrefix')
  })
}
