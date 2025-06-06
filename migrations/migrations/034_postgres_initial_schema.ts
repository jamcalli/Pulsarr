import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * PostgreSQL Initial Schema Migration
 * 
 * This migration consolidates all previous migrations (001-033) for PostgreSQL.
 * It only runs on PostgreSQL databases and creates the complete schema with
 * PostgreSQL-specific optimizations.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async trx => {
    const knex = trx; // re-alias for readability
    
    // Only run on PostgreSQL
    if (!isPostgreSQL(knex)) {
      console.log('Skipping PostgreSQL initial schema on non-PostgreSQL database')
      return
    }

    console.log('Creating PostgreSQL initial schema...')

  // Create ENUM types for PostgreSQL
  await knex.raw(`
    CREATE TYPE watchlist_status AS ENUM ('pending', 'requested', 'grabbed', 'notified');
    CREATE TYPE series_status AS ENUM ('continuing', 'ended');
    CREATE TYPE movie_status AS ENUM ('available', 'unavailable');
    CREATE TYPE notification_type AS ENUM ('episode', 'season', 'movie', 'watchlist_add');
    CREATE TYPE monitoring_type AS ENUM ('pilotRolling', 'firstSeasonRolling');
    CREATE TYPE delete_sync_notify AS ENUM ('none', 'message', 'webhook', 'both', 'all', 'discord-only', 'apprise-only', 'webhook-only', 'dm-only', 'discord-webhook', 'discord-message', 'discord-both');
    CREATE TYPE removed_tag_mode AS ENUM ('remove', 'keep', 'special-tag');
    CREATE TYPE deletion_mode AS ENUM ('watchlist', 'tag-based');
    CREATE TYPE auth_method AS ENUM ('required', 'requiredExceptLocal', 'disabled');
    CREATE TYPE log_level AS ENUM ('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent');
    CREATE TYPE monitor_new_items AS ENUM ('all', 'none');
    CREATE TYPE minimum_availability AS ENUM ('announced', 'inCinemas', 'released');
    CREATE TYPE series_type AS ENUM ('standard', 'anime', 'daily');
  `)

  // Create users table
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('apprise').nullable()
    table.string('alias').nullable()
    table.string('discord_id')
    table.boolean('notify_apprise').defaultTo(false)
    table.boolean('notify_discord').defaultTo(false)
    table.boolean('notify_tautulli').defaultTo(false)
    table.integer('tautulli_notifier_id').nullable()
    table.boolean('can_sync').defaultTo(true)
    table.boolean('is_primary_token').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index('name')
    table.index(['notify_discord', 'discord_id'])
  })

  // Create partial unique index to allow exactly one primary token across all users
  await knex.raw(`
    CREATE UNIQUE INDEX users_is_primary_token_unique 
    ON users(is_primary_token) 
    WHERE is_primary_token = true
  `)

  // Create admin_users table
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

  // Create sonarr_instances table
  await knex.schema.createTable('sonarr_instances', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.string('base_url').notNullable()
    table.string('api_key').notNullable()
    table.string('quality_profile').nullable()
    table.string('root_folder').nullable()
    table.boolean('bypass_ignored').defaultTo(false)
    table.string('season_monitoring').defaultTo('all')
    table.specificType('monitor_new_items', 'monitor_new_items').defaultTo('all')
    table.boolean('search_on_add').defaultTo(true)
    table.jsonb('tags').defaultTo('[]')
    table.boolean('is_default').defaultTo(false)
    table.boolean('is_enabled').defaultTo(true)
    table.jsonb('synced_instances').defaultTo('[]')
    table.specificType('series_type', 'series_type').defaultTo('standard')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  // Create radarr_instances table
  await knex.schema.createTable('radarr_instances', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.string('base_url').notNullable()
    table.string('api_key').notNullable()
    table.string('quality_profile').nullable()
    table.string('root_folder').nullable()
    table.boolean('bypass_ignored').defaultTo(false)
    table.boolean('search_on_add').defaultTo(true)
    table.specificType('minimum_availability', 'minimum_availability').defaultTo('released')
    table.jsonb('tags').defaultTo('[]')
    table.boolean('is_default').defaultTo(false)
    table.boolean('is_enabled').defaultTo(true)
    table.jsonb('synced_instances').defaultTo('[]')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  // Create configs table
  await knex.schema.createTable('configs', (table) => {
    table.increments('id').primary()
    // App configuration
    table.integer('port')
    table.string('dbPath')
    table.string('baseUrl')
    table.string('cookieSecret')
    table.string('cookieName')
    table.boolean('cookieSecured')
    table.specificType('logLevel', 'log_level')
    table.integer('closeGraceDelay')
    table.integer('rateLimitMax')
    table.integer('syncIntervalSeconds').defaultTo(10)
    table.integer('queueProcessDelaySeconds').defaultTo(60)
    
    // Discord configuration
    table.string('discordWebhookUrl')
    table.string('discordBotToken')
    table.string('discordClientId')
    table.string('discordGuildId')
    
    // Notification configuration
    table.integer('queueWaitTime').defaultTo(120000)
    table.integer('newEpisodeThreshold').defaultTo(172800000)
    table.integer('upgradeBufferTime').defaultTo(2000)
    
    // Apprise configuration
    table.boolean('enableApprise').defaultTo(false)
    table.string('appriseUrl').defaultTo('')
    table.string('systemAppriseUrl')
    
    // Tautulli configuration
    table.boolean('tautulliEnabled').defaultTo(false)
    table.string('tautulliUrl').nullable()
    table.string('tautulliApiKey').nullable()
    
    // Plex configuration
    table.jsonb('plexTokens')
    table.boolean('skipFriendSync')
    table.string('plexServerUrl').defaultTo('http://localhost:32400')
    table.boolean('enablePlexPlaylistProtection').defaultTo(false)
    table.string('plexProtectionPlaylistName').defaultTo('Do Not Delete')
    table.jsonb('plexSessionMonitoring').nullable()
    
    // Delete sync configuration
    table.boolean('deleteMovie')
    table.boolean('deleteEndedShow')
    table.boolean('deleteContinuingShow')
    table.boolean('deleteFiles')
    table.boolean('respectUserSyncSetting').defaultTo(true)
    table.specificType('deleteSyncNotify', 'delete_sync_notify').defaultTo('none')
    table.boolean('deleteSyncNotifyOnlyOnDeletion').defaultTo(false)
    table.integer('maxDeletionPrevention').defaultTo(10)
    
    // User tagging configuration
    table.boolean('tagUsersInSonarr').defaultTo(false)
    table.boolean('tagUsersInRadarr').defaultTo(false)
    table.boolean('cleanupOrphanedTags').defaultTo(true)
    table.boolean('persistHistoricalTags').defaultTo(false)
    table.string('tagPrefix').defaultTo('pulsarr:user')
    table.specificType('removedTagMode', 'removed_tag_mode').defaultTo('remove')
    table.string('removedTagPrefix').defaultTo('pulsarr:removed')
    table.specificType('deletionMode', 'deletion_mode').defaultTo('watchlist')
    
    // Pending webhook configuration
    table.integer('pendingWebhookRetryInterval').defaultTo(20)
    table.integer('pendingWebhookMaxAge').defaultTo(10)
    table.integer('pendingWebhookCleanupInterval').defaultTo(60)
    
    // New user defaults
    table.boolean('newUserDefaultCanSync').defaultTo(true)
    
    // RSS configuration
    table.string('selfRss')
    table.string('friendsRss')
    
    // Ready state
    table.boolean('_isReady').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  // Create watchlist_items table
  await knex.schema.createTable('watchlist_items', (table) => {
    table.increments('id').primary()
    table.integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.string('title').notNullable()
    table.string('key').notNullable()
    table.string('type').notNullable()
    table.string('thumb')
    table.string('added')
    table.jsonb('guids').defaultTo('[]')
    table.jsonb('genres').defaultTo('[]')
    table.specificType('status', 'watchlist_status').notNullable().defaultTo('pending')
    table.timestamp('last_notified_at').nullable()
    table.specificType('series_status', 'series_status').nullable()
    table.specificType('movie_status', 'movie_status').nullable()
    table.integer('sonarr_instance_id')
      .references('id')
      .inTable('sonarr_instances')
      .onDelete('SET NULL')
    table.integer('radarr_instance_id')
      .references('id')
      .inTable('radarr_instances')
      .onDelete('SET NULL')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['user_id', 'key'])
    table.index(['user_id', 'key'])
    table.index('user_id')
    table.index('guids', undefined, 'gin')
    table.index('sonarr_instance_id')
    table.index('radarr_instance_id')
    table.index('status')
    table.index('type')
  })

  // Create watchlist_status_history table
  await knex.schema.createTable('watchlist_status_history', (table) => {
    table.increments('id').primary()
    table.integer('watchlist_item_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.specificType('status', 'watchlist_status').notNullable()
    table.timestamp('timestamp').defaultTo(knex.fn.now())
    table.index(['watchlist_item_id', 'status'])
    table.index('timestamp')
  })

  // Create notifications table
  await knex.schema.createTable('notifications', (table) => {
    table.increments('id').primary()
    table.integer('watchlist_item_id')
      .nullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.integer('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.specificType('type', 'notification_type').notNullable()
    table.string('title').notNullable()
    table.text('message').nullable()
    table.integer('season_number').nullable()
    table.integer('episode_number').nullable()
    table.boolean('sent_to_discord').defaultTo(false)
    table.boolean('sent_to_apprise').defaultTo(false)
    table.boolean('sent_to_webhook').defaultTo(false)
    table.boolean('sent_to_tautulli').defaultTo(false)
    table.string('notification_status').defaultTo('active')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index(['watchlist_item_id'])
    table.index(['user_id'])
    table.index(['created_at'])
    table.index(['type'])
    table.index(['watchlist_item_id', 'type', 'notification_status'])
  })

  // Create junction tables
  await knex.schema.createTable('watchlist_radarr_instances', (table) => {
    table.increments('id').primary()
    table.integer('watchlist_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.integer('radarr_instance_id')
      .notNullable()
      .references('id')
      .inTable('radarr_instances')
      .onDelete('CASCADE')
    table.specificType('status', 'watchlist_status').notNullable().defaultTo('pending')
    table.boolean('is_primary').defaultTo(false)
    table.boolean('syncing').defaultTo(false)
    table.timestamp('last_notified_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['watchlist_id', 'radarr_instance_id'])
    table.index(['watchlist_id'])
    table.index(['radarr_instance_id'])
    table.index(['is_primary'])
    table.index(['syncing'])
  })

  await knex.schema.createTable('watchlist_sonarr_instances', (table) => {
    table.increments('id').primary()
    table.integer('watchlist_id')
      .notNullable()
      .references('id')
      .inTable('watchlist_items')
      .onDelete('CASCADE')
    table.integer('sonarr_instance_id')
      .notNullable()
      .references('id')
      .inTable('sonarr_instances')
      .onDelete('CASCADE')
    table.specificType('status', 'watchlist_status').notNullable().defaultTo('pending')
    table.boolean('is_primary').defaultTo(false)
    table.boolean('syncing').defaultTo(false)
    table.timestamp('last_notified_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['watchlist_id', 'sonarr_instance_id'])
    table.index(['watchlist_id'])
    table.index(['sonarr_instance_id'])
    table.index(['is_primary'])
    table.index(['syncing'])
  })

  // Create genres table
  await knex.schema.createTable('genres', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.boolean('is_custom').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index('name')
  })

  // Create temp_rss_items table
  await knex.schema.createTable('temp_rss_items', (table) => {
    table.increments('id').primary()
    table.string('title').notNullable()
    table.string('type').notNullable()
    table.string('thumb')
    table.jsonb('guids').notNullable()
    table.jsonb('genres')
    table.string('source').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index('guids', undefined, 'gin')
  })

  // Create schedules table
  await knex.schema.createTable('schedules', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.string('type').notNullable()
    table.jsonb('config').notNullable()
    table.boolean('enabled').defaultTo(true)
    table.jsonb('last_run').nullable()
    table.jsonb('next_run').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index('name')
    table.index('enabled')
    table.index(['enabled', 'type'])
  })

  // Create router_rules table
  await knex.schema.createTable('router_rules', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('type').notNullable()
    table.jsonb('criteria').notNullable()
    table.string('target_type').notNullable()
    table.integer('target_instance_id').notNullable()
    table.string('root_folder')
    table.integer('quality_profile')
    table.jsonb('tags').defaultTo('[]')
    table.integer('order').defaultTo(50)
    table.boolean('enabled').defaultTo(true)
    table.jsonb('metadata').nullable()
    table.boolean('search_on_add').nullable()
    table.string('season_monitoring').nullable()
    table.string('series_type').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index(['type', 'enabled'])
    table.index('target_type')
    table.index('target_instance_id')
  })

  // Create pending_webhooks table
  await knex.schema.createTable('pending_webhooks', (table) => {
    table.increments('id').primary()
    table.string('instance_type', 10).notNullable()
    table.integer('instance_id').nullable()
    table.string('guid', 255).notNullable()
    table.string('title', 255).notNullable()
    table.string('media_type', 10).notNullable()
    table.jsonb('payload').notNullable()
    table.timestamp('received_at').defaultTo(knex.fn.now())
    table.timestamp('expires_at').notNullable()
    table.index(['guid', 'media_type'], 'idx_guid_media')
    table.index('expires_at')
    table.check("instance_type IN ('radarr', 'sonarr')")
    table.check("media_type IN ('movie', 'show')")
  })

  // Create rolling_monitored_shows table
  await knex.schema.createTable('rolling_monitored_shows', (table) => {
    table.increments('id').primary()
    table.integer('sonarr_series_id').notNullable()
    table.integer('sonarr_instance_id').notNullable()
    table.foreign('sonarr_instance_id').references('sonarr_instances.id').onDelete('CASCADE')
    table.string('tvdb_id').nullable()
    table.string('imdb_id').nullable()
    table.string('show_title').notNullable()
    table.specificType('monitoring_type', 'monitoring_type').notNullable()
    table.integer('current_monitored_season').notNullable().defaultTo(1)
    table.integer('last_watched_season').notNullable().defaultTo(0)
    table.integer('last_watched_episode').notNullable().defaultTo(0)
    table.timestamp('last_session_date').defaultTo(knex.fn.now())
    table.string('plex_user_id').nullable()
    table.string('plex_username').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.timestamp('last_updated_at').defaultTo(knex.fn.now())
    table.index(['sonarr_series_id', 'sonarr_instance_id'])
    table.index('tvdb_id')
    table.index('show_title')
    table.index('monitoring_type')
    table.index('last_updated_at')
  })

  // Create PostgreSQL trigger functions for cascading router rule deletions
  await knex.raw(`
    CREATE OR REPLACE FUNCTION cascade_delete_router_rules_sonarr()
    RETURNS TRIGGER AS $$
    BEGIN
      DELETE FROM router_rules 
      WHERE target_type = 'sonarr' AND target_instance_id = OLD.id;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION cascade_delete_router_rules_radarr()
    RETURNS TRIGGER AS $$
    BEGIN
      DELETE FROM router_rules 
      WHERE target_type = 'radarr' AND target_instance_id = OLD.id;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER fk_router_rules_sonarr_delete
    BEFORE DELETE ON sonarr_instances
    FOR EACH ROW
    EXECUTE FUNCTION cascade_delete_router_rules_sonarr();

    CREATE TRIGGER fk_router_rules_radarr_delete
    BEFORE DELETE ON radarr_instances
    FOR EACH ROW
    EXECUTE FUNCTION cascade_delete_router_rules_radarr();
  `)

  // Seed default genres
  const defaultGenres = [
    'Action', 'Action/Adventure', 'Adventure', 'Animation', 'Anime', 'Biography',
    'Children', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
    'Food', 'Game Show', 'History', 'Home and Garden', 'Horror', 'Indie',
    'Martial Arts', 'Mini-Series', 'Music', 'Musical', 'Mystery', 'News',
    'Reality', 'Romance', 'Sci-Fi & Fantasy', 'Science Fiction', 'Short',
    'Soap', 'Sport', 'Suspense', 'TV Movie', 'Talk', 'Talk Show', 'Thriller',
    'Travel', 'War', 'War & Politics', 'Western'
  ].map(name => ({
    name,
    is_custom: false,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  }))

  await knex('genres').insert(defaultGenres)

  // Seed default schedules
  const defaultSchedules = [
    {
      name: 'delete-sync',
      type: 'cron',
      config: { expression: '0 1 * * 0' },
      enabled: false,
      last_run: null,
      next_run: null,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      name: 'plex-rolling-auto-reset',
      type: 'interval',
      config: { hours: 24 },
      enabled: false,
      last_run: null,
      next_run: null,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }
  ]

    await knex('schedules').insert(defaultSchedules)

    console.log('PostgreSQL initial schema created successfully!')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async trx => {
    const knex = trx; // re-alias for readability
    
    // Only run on PostgreSQL
    if (!isPostgreSQL(knex)) {
      return
    }

    console.log('Dropping PostgreSQL schema...')

  // Drop triggers and indexes first
  await knex.raw(`
    DROP TRIGGER IF EXISTS fk_router_rules_sonarr_delete ON sonarr_instances;
    DROP TRIGGER IF EXISTS fk_router_rules_radarr_delete ON radarr_instances;
    DROP FUNCTION IF EXISTS cascade_delete_router_rules_sonarr();
    DROP FUNCTION IF EXISTS cascade_delete_router_rules_radarr();
    DROP INDEX IF EXISTS users_is_primary_token_unique;
  `)

  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('rolling_monitored_shows')
  await knex.schema.dropTableIfExists('pending_webhooks')
  await knex.schema.dropTableIfExists('router_rules')
  await knex.schema.dropTableIfExists('schedules')
  await knex.schema.dropTableIfExists('temp_rss_items')
  await knex.schema.dropTableIfExists('genres')
  await knex.schema.dropTableIfExists('watchlist_sonarr_instances')
  await knex.schema.dropTableIfExists('watchlist_radarr_instances')
  await knex.schema.dropTableIfExists('notifications')
  await knex.schema.dropTableIfExists('watchlist_status_history')
  await knex.schema.dropTableIfExists('watchlist_items')
  await knex.schema.dropTableIfExists('configs')
  await knex.schema.dropTableIfExists('radarr_instances')
  await knex.schema.dropTableIfExists('sonarr_instances')
  await knex.schema.dropTableIfExists('admin_users')
  await knex.schema.dropTableIfExists('users')

  // Drop ENUM types
  await knex.raw(`
    DROP TYPE IF EXISTS series_type;
    DROP TYPE IF EXISTS minimum_availability;
    DROP TYPE IF EXISTS monitor_new_items;
    DROP TYPE IF EXISTS log_level;
    DROP TYPE IF EXISTS auth_method;
    DROP TYPE IF EXISTS deletion_mode;
    DROP TYPE IF EXISTS removed_tag_mode;
    DROP TYPE IF EXISTS delete_sync_notify;
    DROP TYPE IF EXISTS monitoring_type;
    DROP TYPE IF EXISTS notification_type;
    DROP TYPE IF EXISTS movie_status;
    DROP TYPE IF EXISTS series_status;
    DROP TYPE IF EXISTS watchlist_status;
    `)

    console.log('PostgreSQL schema dropped successfully!')
  })
}