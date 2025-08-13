import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Applies the initial database schema by creating all required tables and indexes for users, admin users, Sonarr and Radarr instances, genre routing, configurations, watchlists, genres, and temporary RSS items.
 *
 * @remark
 * If running on PostgreSQL and `shouldSkipForPostgreSQL` returns true for this migration, the schema creation is skipped.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '001_initial_schema')) {
    return
  }
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('email').nullable()
    table.string('alias').nullable()
    table.string('discord_id')
    table.boolean('notify_email').defaultTo(false)
    table.boolean('notify_discord').defaultTo(false)
    table.boolean('can_sync').defaultTo(true)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index('name')
    table.index(['notify_discord', 'discord_id'])
  })

  await knex.schema.createTable('admin_users', (table) => {
    table.increments('id').primary()
    table.string('username').notNullable().unique()
    table.string('password').notNullable()
    table.string('email').notNullable().unique()
    table.string('role').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index(['email', 'username'])
  })

  await knex.schema.createTable('sonarr_instances', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.string('base_url').notNullable()
    table.string('api_key').notNullable()
    table.string('quality_profile')
    table.string('root_folder')
    table.boolean('bypass_ignored').defaultTo(false)
    table.string('season_monitoring').defaultTo('all')
    table.json('tags').defaultTo('[]')
    table.json('synced_instances').defaultTo('[]')
    table.boolean('is_default').defaultTo(false)
    table.boolean('is_enabled').defaultTo(true)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index('name')
    table.index('is_default')
    table.index('is_enabled')
  })

  await knex.schema.createTable('radarr_instances', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.string('base_url').notNullable()
    table.string('api_key').notNullable()
    table.string('quality_profile')
    table.string('root_folder')
    table.boolean('bypass_ignored').defaultTo(false)
    table.json('tags').defaultTo('[]')
    table.json('synced_instances').defaultTo('[]')
    table.boolean('is_default').defaultTo(false)
    table.boolean('is_enabled').defaultTo(true)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index('name')
    table.index('is_default')
    table.index('is_enabled')
  })

  await knex.schema.createTable('sonarr_genre_routing', (table) => {
    table.increments('id').primary()
    table
      .integer('sonarr_instance_id')
      .references('id')
      .inTable('sonarr_instances')
      .onDelete('CASCADE')
    table.string('name').notNullable()
    table.string('genre').notNullable()
    table.string('root_folder').notNullable()
    table.integer('quality_profile').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['sonarr_instance_id', 'genre'])
    table.index(['sonarr_instance_id', 'genre'])
    table.index('name')
  })

  await knex.schema.createTable('radarr_genre_routing', (table) => {
    table.increments('id').primary()
    table
      .integer('radarr_instance_id')
      .references('id')
      .inTable('radarr_instances')
      .onDelete('CASCADE')
    table.string('name').notNullable()
    table.string('genre').notNullable()
    table.string('root_folder').notNullable()
    table.integer('quality_profile').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['radarr_instance_id', 'genre'])
    table.index(['radarr_instance_id', 'genre'])
    table.index('name')
  })

  await knex.schema.createTable('configs', (table) => {
    table.increments('id').primary()
    // App
    table.integer('port')
    table.string('dbPath')
    table.string('baseUrl')
    table.string('cookieSecret')
    table.string('cookieName')
    table.boolean('cookieSecured')
    table.string('logLevel')
    table.integer('closeGraceDelay')
    table.integer('rateLimitMax')
    table.integer('syncIntervalSeconds').defaultTo(10)
    table.integer('queueProcessDelaySeconds').defaultTo(60)
    // Discord
    table.string('discordWebhookUrl')
    table.string('discordBotToken')
    table.string('discordClientId')
    table.string('discordGuildId')
    // General Notifications
    table.integer('queueWaitTime').defaultTo(120000)
    table.integer('newEpisodeThreshold').defaultTo(172800000)
    table.integer('upgradeBufferTime').defaultTo(2000)
    // Plex
    table.json('plexTokens')
    table.boolean('skipFriendSync')
    // Delete
    table.boolean('deleteMovie')
    table.boolean('deleteEndedShow')
    table.boolean('deleteContinuingShow')
    table.integer('deleteIntervalDays')
    table.boolean('deleteFiles')
    // RSS
    table.string('selfRss')
    table.string('friendsRss')
    // Ready State
    table.boolean('_isReady').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('watchlist_items', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.string('title').notNullable()
    table.string('key').notNullable()
    table.string('type').notNullable()
    table.string('thumb')
    table.string('added')
    table.json('guids')
    table.json('genres')
    table
      .enum('status', ['pending', 'requested', 'grabbed', 'notified'])
      .notNullable()
      .defaultTo('pending')
    table.timestamp('last_notified_at').nullable()
    table.enum('series_status', ['continuing', 'ended'])
    table.enum('movie_status', ['available', 'unavailable'])
    table
      .integer('sonarr_instance_id')
      .references('id')
      .inTable('sonarr_instances')
      .onDelete('SET NULL')
    table
      .integer('radarr_instance_id')
      .references('id')
      .inTable('radarr_instances')
      .onDelete('SET NULL')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['user_id', 'key'])
    table.index(['user_id', 'key'])
    table.index('user_id')
    table.index('guids')
    table.index('sonarr_instance_id')
    table.index('radarr_instance_id')
  })

  await knex.schema.createTable('genres', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.boolean('is_custom').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index('name')
  })

  await knex.schema.createTable('temp_rss_items', (table) => {
    table.increments('id').primary()
    table.string('title').notNullable()
    table.string('type').notNullable()
    table.string('thumb')
    table.json('guids').notNullable()
    table.json('genres')
    table.string('source').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index('guids')
  })
}

/**
 * Reverts the initial database schema by dropping all tables created in the corresponding migration.
 *
 * Drops tables in reverse order of creation, unless the operation is skipped for PostgreSQL.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }

  await knex.schema.dropTable('temp_rss_items')
  await knex.schema.dropTable('watchlist_items')
  await knex.schema.dropTable('radarr_genre_routing')
  await knex.schema.dropTable('sonarr_genre_routing')
  await knex.schema.dropTable('radarr_instances')
  await knex.schema.dropTable('sonarr_instances')
  await knex.schema.dropTable('configs')
  await knex.schema.dropTable('admin_users')
  await knex.schema.dropTable('users')
  await knex.schema.dropTable('genres')
}
