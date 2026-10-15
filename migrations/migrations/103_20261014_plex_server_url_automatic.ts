import type { Knex } from 'knex'

const LEGACY_AUTOMATIC_URL = 'http://localhost:32400'

export async function up(knex: Knex): Promise<void> {
  await knex('configs')
    .where('plexServerUrl', LEGACY_AUTOMATIC_URL)
    .update({ plexServerUrl: '' })

  await knex.schema.alterTable('configs', (table) => {
    table.string('plexServerUrl').defaultTo('').alter()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('plexServerUrl').defaultTo(LEGACY_AUTOMATIC_URL).alter()
  })

  await knex('configs')
    .where('plexServerUrl', '')
    .update({ plexServerUrl: LEGACY_AUTOMATIC_URL })
}
