import type { Knex } from 'knex'

/**
 * Adds skipIfExistsOnPlex configuration option to prevent downloading content that already exists on accessible Plex servers.
 *
 * Introduces a new boolean column to the `configs` table:
 * - `skipIfExistsOnPlex`: When enabled, Pulsarr will check all accessible Plex servers (using the primary token) during
 *   the reconciliation phase and skip downloading content if it already exists on any server.
 *
 * This feature:
 * - Only works with the primary token (admin's token with server access)
 * - Requires deferred processing to reconciliation phase to determine user attribution
 * - Helps prevent duplicate downloads when content is already available on friend's servers
 *
 * Defaults to FALSE (disabled) for backward compatibility.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('skipIfExistsOnPlex').defaultTo(false)
  })
}

/**
 * Removes the skipIfExistsOnPlex configuration column.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('skipIfExistsOnPlex')
  })
}
