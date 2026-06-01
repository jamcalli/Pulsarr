import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('watchlist_exclusions', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.string('key').notNullable()
    table.string('title').notNullable()
    table.string('type').notNullable()
    table.json('guids').notNullable().defaultTo('[]')
    table.timestamp('excluded_at').notNullable().defaultTo(knex.fn.now())

    table.unique(['user_id', 'key'])
    table.index('user_id')
    table.index('key')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('watchlist_exclusions')
}
