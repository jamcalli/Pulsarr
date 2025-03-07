import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Create junction table for watchlist items to Radarr instances
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
    table.boolean('is_primary').defaultTo(false)
    table.enum('status', ['pending', 'requested', 'grabbed', 'notified'])
      .notNullable()
      .defaultTo('pending')
    table.timestamp('last_notified_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['watchlist_id', 'radarr_instance_id'])
    table.index(['watchlist_id', 'radarr_instance_id'])
    table.index('is_primary')
  })

  // Create junction table for watchlist items to Sonarr instances
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
    table.boolean('is_primary').defaultTo(false)
    table.enum('status', ['pending', 'requested', 'grabbed', 'notified'])
      .notNullable()
      .defaultTo('pending')
    table.timestamp('last_notified_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['watchlist_id', 'sonarr_instance_id'])
    table.index(['watchlist_id', 'sonarr_instance_id'])
    table.index('is_primary')
  })
  
  // Migrate existing data to junction tables
  const watchlistItems = await knex.select('*').from('watchlist_items')
  
  for (const item of watchlistItems) {
    if (item.radarr_instance_id) {
      await knex('watchlist_radarr_instances').insert({
        watchlist_id: item.id,
        radarr_instance_id: item.radarr_instance_id,
        is_primary: true,
        status: item.status,
        last_notified_at: item.last_notified_at
      })
    }
    
    if (item.sonarr_instance_id) {
      await knex('watchlist_sonarr_instances').insert({
        watchlist_id: item.id,
        sonarr_instance_id: item.sonarr_instance_id,
        is_primary: true,
        status: item.status,
        last_notified_at: item.last_notified_at
      })
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('watchlist_radarr_instances')
  await knex.schema.dropTable('watchlist_sonarr_instances')
}