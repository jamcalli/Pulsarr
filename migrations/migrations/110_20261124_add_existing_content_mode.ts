import type { Knex } from 'knex'

// SQLite ignores the foreign-key pragma inside a transaction, so the down dropColumn rebuild would cascade child rows away.
export const config = { transaction: false }

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.string('existing_content_mode').notNullable().defaultTo('off')
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.string('existing_content_mode').notNullable().defaultTo('off')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('existing_content_mode')
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('existing_content_mode')
  })
}
