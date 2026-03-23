import type { Knex } from 'knex'

/**
 * Stores friend metadata from the Plex API so the classification
 * endpoint can query directly from the DB instead of re-fetching each time.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('plex_uuid').nullable()
    table.string('avatar').nullable()
    table.string('display_name').nullable()
    table.string('friend_created_at').nullable()
    table.index(['plex_uuid'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['plex_uuid'])
    table.dropColumn('friend_created_at')
    table.dropColumn('display_name')
    table.dropColumn('avatar')
    table.dropColumn('plex_uuid')
  })
}
