import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_quotas_new', (table) => {
    table.increments('id').primary()
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
    table.enum('content_type', ['movie', 'show']).notNullable()
    table
      .enum('quota_type', ['daily', 'weekly_rolling', 'monthly'])
      .notNullable()
    table.integer('quota_limit').notNullable()
    table.boolean('bypass_approval').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.unique(['user_id', 'content_type'])
    table.index(['user_id', 'quota_type'])
    table.index(['bypass_approval'])
    table.index(['content_type'])
  })

  const existingQuotas = await knex('user_quotas').select('*')

  await knex.transaction(async (trx) => {
    for (const quota of existingQuotas) {
      await trx('user_quotas_new').insert({
        user_id: quota.user_id,
        content_type: 'movie',
        quota_type: quota.quota_type,
        quota_limit: quota.quota_limit,
        bypass_approval: quota.bypass_approval,
        created_at: quota.created_at,
        updated_at: quota.updated_at,
      })

      await trx('user_quotas_new').insert({
        user_id: quota.user_id,
        content_type: 'show',
        quota_type: quota.quota_type,
        quota_limit: quota.quota_limit,
        bypass_approval: quota.bypass_approval,
        created_at: quota.created_at,
        updated_at: quota.updated_at,
      })
    }
  })

  await knex.schema.dropTable('user_quotas')
  await knex.schema.renameTable('user_quotas_new', 'user_quotas')
}

export async function down(knex: Knex): Promise<void> {
  // WARNING: This will permanently delete all show quota data
  await knex('user_quotas').where('content_type', 'show').del()

  await knex.schema.alterTable('user_quotas', (table) => {
    table.dropUnique(['user_id', 'content_type'])
    table.dropIndex(['content_type'])

    table.unique(['user_id'])
    table.dropColumn('content_type')
  })
}
