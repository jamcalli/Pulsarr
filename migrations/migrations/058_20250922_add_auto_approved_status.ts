import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  return knex.transaction(async (trx) => {
    // For both SQLite and PostgreSQL, we need to recreate the column
    // because neither database supports adding enum values directly

    // Create new column with expanded enum
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
    })

    // Copy existing data
    await trx('approval_requests').update({
      status_new: trx.ref('status'),
    })

    // Drop old column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropColumn('status')
    })

    // Rename new column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.renameColumn('status_new', 'status')
    })
  })
}

export async function down(knex: Knex): Promise<void> {
  return knex.transaction(async (trx) => {
    // Convert any auto_approved records to approved
    await trx('approval_requests')
      .where('status', 'auto_approved')
      .update({ status: 'approved' })

    // Create new column without auto_approved
    await trx.schema.alterTable('approval_requests', (table) => {
      table
        .enum('status_new', ['pending', 'approved', 'rejected', 'expired'])
        .defaultTo('pending')
    })

    // Copy existing data
    await trx('approval_requests').update({
      status_new: trx.ref('status'),
    })

    // Drop old column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropColumn('status')
    })

    // Rename new column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.renameColumn('status_new', 'status')
    })
  })
}
