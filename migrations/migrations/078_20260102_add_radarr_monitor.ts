import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.string('monitor', 20).defaultTo('movieOnly')
  })

  await knex.schema.alterTable('router_rules', (table) => {
    table.string('monitor', 20).nullable()
  })

  await knex('radarr_instances')
    .whereNull('monitor')
    .update({ monitor: 'movieOnly' })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('monitor')
  })

  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('monitor')
  })
}
