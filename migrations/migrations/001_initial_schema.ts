import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('email').nullable()
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
    table.string('added')
    table.json('guids')
    table.json('genres')
    table.enum('status', ['pending', 'requested', 'grabbed', 'notified'])
      .notNullable()
      .defaultTo('pending')
    table.enum('series_status', ['continuing', 'ended'])
    table.enum('movie_status', ['available', 'unavailable'])
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['user_id', 'key'])
    table.index(['user_id', 'key'])
    table.index('user_id') 
    table.index('guids')
  })

  // Create RSS pending user
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

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('temp_rss_items')
  await knex.schema.dropTable('watchlist_items')
  await knex.schema.dropTable('configs')
  await knex.schema.dropTable('admin_users')
  await knex.schema.dropTable('users')
}