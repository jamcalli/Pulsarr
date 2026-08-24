import type { Knex } from 'knex'

// The username captured at row creation goes stale when a Plex account is
// renamed; the uuid is the stable identity for user matching.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.string('plex_user_uuid').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.dropColumn('plex_user_uuid')
  })
}
