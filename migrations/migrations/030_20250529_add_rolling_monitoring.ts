import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '030_20250529_add_rolling_monitoring')) {
    return
  }
  await knex.schema.createTable('rolling_monitored_shows', (table) => {
    table.increments('id').primary()

    table.integer('sonarr_series_id').notNullable()
    table.integer('sonarr_instance_id').unsigned().notNullable()
    table
      .foreign('sonarr_instance_id')
      .references('sonarr_instances.id')
      .onDelete('CASCADE')

    table.string('tvdb_id').nullable()
    table.string('imdb_id').nullable()
    table.string('show_title').notNullable()

    table
      .enum('monitoring_type', ['pilotRolling', 'firstSeasonRolling'])
      .notNullable()
    table.integer('current_monitored_season').notNullable().defaultTo(1)

    table.integer('last_watched_season').notNullable().defaultTo(0)
    table.integer('last_watched_episode').notNullable().defaultTo(0)
    table.timestamp('last_session_date').nullable()

    table.string('plex_user_id').nullable()
    table.string('plex_username').nullable()

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())

    table.index(['sonarr_series_id', 'sonarr_instance_id'])
    table.index('tvdb_id')
    table.index('show_title')
    table.index('monitoring_type')
  })

  await knex.schema.alterTable('configs', (table) => {
    table.json('plexSessionMonitoring').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('plexSessionMonitoring')
  })

  await knex.schema.dropTableIfExists('rolling_monitored_shows')
}
