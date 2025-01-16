import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('email').notNullable().unique()
    table.timestamp('created_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('configs', (table) => {
    table.increments('id').primary()
    table.json('plexTokens').notNullable()
    table.integer('port').notNullable()
    table.json('selfRss')
    table.json('friendsRss')
  })

  await knex.schema.createTable('watchlist_items', (table) => {
    table.increments('id').primary()
    table.string('user').notNullable()
    table.string('title').notNullable()
    table.string('key').notNullable()
    table.string('type').notNullable()
    table.string('thumb')
    table.json('guids')
    table.json('genres')
    table.unique(['user', 'key'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('watchlist_items')
  await knex.schema.dropTable('configs')
  await knex.schema.dropTable('users')
}