import type { Knex } from 'knex'

/**
 * Adds routed flag to temp_rss_items table to track whether content was successfully routed to Radarr/Sonarr.
 *
 * This enables route-only notifications: admins are only notified when content is actually routed,
 * rather than for every watchlist addition (including items that already exist, are pending approval, or fail routing).
 *
 * The flag is set when routing succeeds in the RSS immediate processing path (processRadarrItem/processSonarrItem),
 * then checked during RSS item matching (processRssPendingItems) before sending "Added by X" notifications.
 *
 * Defaults to FALSE (not routed) for all new temp RSS items.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('temp_rss_items', (table) => {
    table.boolean('routed').defaultTo(false)
  })
}

/**
 * Removes the routed flag from temp_rss_items table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('temp_rss_items', (table) => {
    table.dropColumn('routed')
  })
}
