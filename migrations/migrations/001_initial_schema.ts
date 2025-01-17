import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('email').notNullable().unique()
    table.string('discord_id')  // Discord user ID for notifications
    table.boolean('notify_email').defaultTo(false)  // Whether to send email notifications
    table.boolean('notify_discord').defaultTo(false)  // Whether to send Discord notifications
    table.boolean('can_sync').defaultTo(true)  // Whether user has permission to sync
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('configs', (table) => {
    table.increments('id').primary()
    table.json('plexTokens')
    table.integer('port').notNullable()
    table.json('selfRss')
    table.json('friendsRss')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

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
    table.json('guids')
    table.json('genres')
    table.enum('sync_status', ['pending', 'processing', 'synced'])
      .notNullable()
      .defaultTo('pending')
    table.timestamp('last_synced_at')
    table.timestamp('sync_started_at')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['user_id', 'key'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('watchlist_items')
  await knex.schema.dropTable('configs')
  await knex.schema.dropTable('users')
}