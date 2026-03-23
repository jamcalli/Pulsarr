import type { Knex } from 'knex'

/**
 * Adds the `auto_approved` value to the `status` enum on the `approval_requests` table.
 *
 * Runs inside a transaction and performs an in-place enum expansion by:
 * - creating a new `status_new` enum column that includes `auto_approved` (default `'pending'`, not nullable),
 * - copying existing `status` values into `status_new`,
 * - dropping the old `status` column and its index,
 * - renaming `status_new` to `status`, and
 * - recreating the index on the new `status` column.
 *
 * The operation is atomic; if any step fails the transaction will roll back. The recreate approach is used because SQLite and PostgreSQL do not support adding enum values in-place in a portable manner.
 */
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
        .notNullable()
    })

    // Copy existing data
    await trx('approval_requests').update({
      status_new: trx.ref('status'),
    })

    // Drop index before dropping column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropIndex(['status'])
    })

    // Drop old column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropColumn('status')
    })

    // Rename new column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.renameColumn('status_new', 'status')
    })

    // Recreate the index on the new column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.index(['status'])
    })
  })
}

/**
 * Reverts the approval_requests.status enum to remove `auto_approved`.
 *
 * Runs inside a transaction. Any rows with status `auto_approved` are converted to `approved`,
 * a new enum-backed column without `auto_approved` is created and populated, the old column is
 * dropped and the new column renamed to `status`, and the index on `status` is recreated.
 */
export async function down(knex: Knex): Promise<void> {
  return knex.transaction(async (trx) => {
    // Convert any auto_approved records to approved
    await trx('approval_requests')
      .where('status', 'auto_approved')
      .update({ status: 'approved' })

    // Create new column without auto_approved
    await trx.schema.alterTable('approval_requests', (table) => {
      table
        .enum('status_tmp', ['pending', 'approved', 'rejected', 'expired'])
        .defaultTo('pending')
        .notNullable()
    })

    // Copy existing data
    await trx('approval_requests').update({
      status_tmp: trx.ref('status'),
    })

    // Drop index before dropping column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropIndex(['status'])
    })

    // Drop old column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.dropColumn('status')
    })

    // Rename new column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.renameColumn('status_tmp', 'status')
    })

    // Recreate the index on the new column
    await trx.schema.alterTable('approval_requests', (table) => {
      table.index(['status'])
    })
  })
}
