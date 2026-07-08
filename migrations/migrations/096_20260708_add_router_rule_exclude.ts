import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.boolean('exclude_from_routing').defaultTo(false)
    table.integer('target_instance_id').nullable().alter()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.integer('target_instance_id').notNullable().alter()
    table.dropColumn('exclude_from_routing')
  })
}
