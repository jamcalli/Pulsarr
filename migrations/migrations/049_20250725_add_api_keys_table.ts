import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('api_keys', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('key').notNullable().unique()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.boolean('is_active').defaultTo(true)

    table.index('key')
    table.index('is_active')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('api_keys')
}
