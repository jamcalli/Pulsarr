import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.boolean('skip_default_routing_when_no_match').defaultTo(false)
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.boolean('skip_default_routing_when_no_match').defaultTo(false)
  })

  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('skipDefaultRoutingWhenNoMatch')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('skipDefaultRoutingWhenNoMatch').defaultTo(false)
  })

  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('skip_default_routing_when_no_match')
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('skip_default_routing_when_no_match')
  })
}
