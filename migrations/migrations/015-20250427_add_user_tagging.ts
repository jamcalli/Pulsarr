import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '015-20250427_add_user_tagging')) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('tagUsersInSonarr').defaultTo(false)
    table.boolean('tagUsersInRadarr').defaultTo(false)
  })

  await knex('configs')
    .whereNull('tagUsersInSonarr')
    .update({ tagUsersInSonarr: false })

  await knex('configs')
    .whereNull('tagUsersInRadarr')
    .update({ tagUsersInRadarr: false })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tagUsersInSonarr')
    table.dropColumn('tagUsersInRadarr')
  })
}
