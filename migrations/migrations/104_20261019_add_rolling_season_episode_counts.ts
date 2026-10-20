import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.json('season_episode_counts').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.dropColumn('season_episode_counts')
  })
}
