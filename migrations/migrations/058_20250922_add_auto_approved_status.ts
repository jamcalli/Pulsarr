import type { Knex } from 'knex'

// Column recreate approach because neither SQLite nor PostgreSQL supports
// adding enum values in-place portably
export async function up(knex: Knex): Promise<void> {
  return knex.transaction(async (trx) => {
    await trx.schema.alterTable('approval_requests', (table) => {
      table
        .enum('status_new', [
          'pending',
          'approved',
          'rejected',
          'expired',
          'auto_approved',
        ])
        .defaultTo('pending')
        .notNullable()
    })

    await trx('approval_requests').update({
      status_new: trx.ref('status'),
    })

    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropIndex(['status'])
    })

    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropColumn('status')
    })

    await trx.schema.alterTable('approval_requests', (table) => {
      table.renameColumn('status_new', 'status')
    })

    await trx.schema.alterTable('approval_requests', (table) => {
      table.index(['status'])
    })
  })
}

export async function down(knex: Knex): Promise<void> {
  return knex.transaction(async (trx) => {
    await trx('approval_requests')
      .where('status', 'auto_approved')
      .update({ status: 'approved' })

    await trx.schema.alterTable('approval_requests', (table) => {
      table
        .enum('status_tmp', ['pending', 'approved', 'rejected', 'expired'])
        .defaultTo('pending')
        .notNullable()
    })

    await trx('approval_requests').update({
      status_tmp: trx.ref('status'),
    })

    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropIndex(['status'])
    })

    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropColumn('status')
    })

    await trx.schema.alterTable('approval_requests', (table) => {
      table.renameColumn('status_tmp', 'status')
    })

    await trx.schema.alterTable('approval_requests', (table) => {
      table.index(['status'])
    })
  })
}
