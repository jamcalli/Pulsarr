import type { Knex } from 'knex'

/**
 * Applies the migration to add rolling monitoring support.
 *
 * Creates the `rolling_monitored_shows` table for tracking shows monitored with rolling strategies, including references to Sonarr series and instances, external identifiers, monitoring configuration, progress tracking, and optional Plex user information. Adds a nullable JSON column `plexSessionMonitoring` to the `configs` table for session monitoring configuration.
 */
export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 030_20250529_add_rolling_monitoring - PostgreSQL uses consolidated schema in migration 034')
    return
  }
// Create table for tracking rolling monitored shows
  await knex.schema.createTable('rolling_monitored_shows', (table) => {
    table.increments('id').primary()
    
    // Sonarr references
    table.integer('sonarr_series_id').notNullable()
    table.integer('sonarr_instance_id').unsigned().notNullable()
    table.foreign('sonarr_instance_id').references('sonarr_instances.id').onDelete('CASCADE')
    
    // Series identifiers
    table.string('tvdb_id').nullable()
    table.string('imdb_id').nullable()
    table.string('show_title').notNullable()
    
    // Monitoring configuration
    table.enum('monitoring_type', ['pilotRolling', 'firstSeasonRolling']).notNullable()
    table.integer('current_monitored_season').notNullable().defaultTo(1)
    
    // Progress tracking
    table.integer('last_watched_season').notNullable().defaultTo(0)
    table.integer('last_watched_episode').notNullable().defaultTo(0)
    table.timestamp('last_session_date').nullable()
    
    // Optional user tracking
    table.string('plex_user_id').nullable()
    table.string('plex_username').nullable()
    
    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())
    
    // Indexes
    table.index(['sonarr_series_id', 'sonarr_instance_id'])
    table.index('tvdb_id')
    table.index('show_title')
    table.index('monitoring_type')
  })

  // Add session monitoring configuration to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.json('plexSessionMonitoring').nullable()
  })

  // Note: Rolling monitoring options (pilotRolling, firstSeasonRolling) 
  // are now available for sonarr_instances.season_monitoring field
}

/**
 * Reverts the migration by removing the `plexSessionMonitoring` column from the `configs` table and dropping the `rolling_monitored_shows` table if it exists.
 */
export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  // Remove session monitoring configuration
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('plexSessionMonitoring')
  })

  // Drop the rolling monitored shows table
  await knex.schema.dropTableIfExists('rolling_monitored_shows')
}