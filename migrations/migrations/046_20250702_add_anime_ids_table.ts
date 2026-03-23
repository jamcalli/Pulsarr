import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('anime_ids', (table) => {
    table.increments('id').primary()
    table.string('external_id').notNullable()
    table.string('source').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.unique(['external_id', 'source'])
    table.index(['external_id'])
    table.index(['source'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('anime_ids')
}
