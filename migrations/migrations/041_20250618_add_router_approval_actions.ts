import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.boolean('always_require_approval').defaultTo(false)
    table.boolean('bypass_user_quotas').defaultTo(false)
    table.string('approval_reason').nullable()

    table.index(['always_require_approval'])
    table.index(['bypass_user_quotas'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropIndex(['always_require_approval'])
    table.dropIndex(['bypass_user_quotas'])
    table.dropColumn('always_require_approval')
    table.dropColumn('bypass_user_quotas')
    table.dropColumn('approval_reason')
  })
}
