import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('plex_label_tracking', (table) => {
    table.integer('user_id').nullable().alter()
  })
}

// Will fail if any rows contain a NULL user_id
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('plex_label_tracking', (table) => {
    table.integer('user_id').notNullable().alter()
  })
}
