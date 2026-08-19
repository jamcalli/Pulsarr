import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('maintainerrEnabled').notNullable().defaultTo(false)
    table.string('maintainerrUrl').nullable()
    table.string('maintainerrWebhookSecret').nullable()
    table
      .string('maintainerrExclusionMode')
      .notNullable()
      .defaultTo('watchlisters')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('maintainerrEnabled')
    table.dropColumn('maintainerrUrl')
    table.dropColumn('maintainerrWebhookSecret')
    table.dropColumn('maintainerrExclusionMode')
  })
}
