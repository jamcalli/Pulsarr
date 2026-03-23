import type { Knex } from 'knex'

/**
 * Drops the deprecated temp_rss_items table.
 *
 * This table was used for the old RSS processing flow where items were stored
 * temporarily and matched to users via GUID matching after GraphQL sync.
 *
 * The new RSS processing flow uses direct UUID-based author attribution from
 * the RSS feed's author field, eliminating the need for temporary storage
 * and GUID-based user matching.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('temp_rss_items')
}

/**
 * Restores the temp_rss_items table for rollback.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable('temp_rss_items', (table) => {
    table.increments('id').primary()
    table.string('title').notNullable()
    table.string('type').notNullable()
    table.string('thumb')
    table.json('guids').notNullable()
    table.json('genres')
    table.string('source').notNullable()
    table.boolean('routed').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.index('guids')
  })
}
