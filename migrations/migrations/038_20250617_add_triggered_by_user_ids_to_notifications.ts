import type { Knex } from 'knex'

/**
 * Adds a `triggered_by_user_ids` JSON column to the `notifications` table
 * to track which users have items in their watchlist that trigger public notifications.
 *
 * This column stores an array of user IDs and is used by database triggers to:
 * - Auto-add users when they add items to their watchlist
 * - Auto-remove users when they remove items from their watchlist
 * - Auto-delete public notifications when no users have the item in their watchlist
 *
 * This migration supports both PostgreSQL and SQLite.
 */
export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  await knex.schema.alterTable('notifications', (table) => {
    // Add JSON column to store array of user IDs who have this item in their watchlist
    table.json('triggered_by_user_ids').nullable()
  })

  // Populate existing public notification records with associated user IDs
  // Find all public notifications (user_id IS NULL AND watchlist_item_id IS NULL) and populate their triggered_by_user_ids
  const publicNotifications = await knex('notifications')
    .select('id', 'title', 'type', 'season_number', 'episode_number')
    .whereNull('user_id')
    .whereNull('watchlist_item_id')
    .where('notification_status', 'active')

  for (const notification of publicNotifications) {
    // Find all users who have this title in their watchlist
    const associatedUsers = await knex('watchlist_items')
      .select('user_id')
      .where('title', notification.title)
      .distinct()

    if (associatedUsers.length > 0) {
      const userIds = associatedUsers.map((u) => u.user_id)
      await knex('notifications')
        .where('id', notification.id)
        .update({
          triggered_by_user_ids: JSON.stringify(userIds),
        })
    }
  }

  if (isPostgres) {
    // PostgreSQL specific implementation

    // Create trigger function to handle watchlist item additions
    await knex.raw(`
      CREATE OR REPLACE FUNCTION update_public_notifications_on_watchlist_add()
      RETURNS TRIGGER AS $$
      BEGIN
          -- Update existing public notifications for this title
          -- Add the user to triggered_by_user_ids array if not already present
          UPDATE notifications 
          SET triggered_by_user_ids = CASE 
              WHEN triggered_by_user_ids IS NULL THEN 
                  json_build_array(NEW.user_id)::json
              WHEN NOT (triggered_by_user_ids::jsonb @> json_build_array(NEW.user_id)::jsonb) THEN 
                  (triggered_by_user_ids::jsonb || json_build_array(NEW.user_id)::jsonb)::json
              ELSE 
                  triggered_by_user_ids
          END
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = NEW.title
            AND notification_status = 'active';

          RETURN NEW;
      EXCEPTION WHEN OTHERS THEN
          -- Log error but don't fail the transaction
          RAISE WARNING 'Error in watchlist_add_trigger: %', SQLERRM;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    // Create trigger function to handle watchlist item removals
    await knex.raw(`
      CREATE OR REPLACE FUNCTION update_public_notifications_on_watchlist_remove()
      RETURNS TRIGGER AS $$
      DECLARE
          updated_user_ids jsonb;
      BEGIN
          -- Update existing public notifications for this title
          -- Remove the user from triggered_by_user_ids array
          UPDATE notifications 
          SET triggered_by_user_ids = (
              SELECT CASE 
                  WHEN jsonb_array_length(jsonb_agg(elem)) = 0 THEN NULL
                  ELSE jsonb_agg(elem)::json
              END
              FROM jsonb_array_elements(triggered_by_user_ids::jsonb) AS elem
              WHERE elem != to_jsonb(OLD.user_id)
          )
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = OLD.title
            AND notification_status = 'active'
            AND triggered_by_user_ids IS NOT NULL
            AND triggered_by_user_ids::jsonb @> json_build_array(OLD.user_id)::jsonb;

          -- Delete notifications that have no users left
          DELETE FROM notifications
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = OLD.title
            AND notification_status = 'active'
            AND (triggered_by_user_ids IS NULL 
                 OR triggered_by_user_ids::jsonb = '[]'::jsonb);

          RETURN OLD;
      EXCEPTION WHEN OTHERS THEN
          -- Log error but don't fail the transaction
          RAISE WARNING 'Error in watchlist_remove_trigger: %', SQLERRM;
          RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `)

    // Create triggers on watchlist_items table
    await knex.raw(`
      CREATE TRIGGER watchlist_add_trigger
          AFTER INSERT ON watchlist_items
          FOR EACH ROW
          EXECUTE FUNCTION update_public_notifications_on_watchlist_add();
    `)

    await knex.raw(`
      CREATE TRIGGER watchlist_remove_trigger
          AFTER DELETE ON watchlist_items
          FOR EACH ROW
          EXECUTE FUNCTION update_public_notifications_on_watchlist_remove();
    `)
  } else {
    // SQLite specific implementation

    // SQLite trigger for watchlist item additions
    await knex.raw(`
      CREATE TRIGGER IF NOT EXISTS watchlist_add_trigger
      AFTER INSERT ON watchlist_items
      FOR EACH ROW
      WHEN EXISTS (
          SELECT 1 FROM notifications 
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = NEW.title
            AND notification_status = 'active'
      )
      BEGIN
          UPDATE notifications
          SET triggered_by_user_ids = CASE
              WHEN triggered_by_user_ids IS NULL THEN
                  json_array(NEW.user_id)
              WHEN NOT (json_extract(triggered_by_user_ids, '$') LIKE '%' || NEW.user_id || '%') THEN
                  json_insert(triggered_by_user_ids, '$[#]', NEW.user_id)
              ELSE
                  triggered_by_user_ids
          END
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = NEW.title
            AND notification_status = 'active';
      END;
    `)

    // SQLite trigger for watchlist item removals
    await knex.raw(`
      CREATE TRIGGER IF NOT EXISTS watchlist_remove_trigger
      AFTER DELETE ON watchlist_items
      FOR EACH ROW
      WHEN EXISTS (
          SELECT 1 FROM notifications 
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = OLD.title
            AND notification_status = 'active'
            AND triggered_by_user_ids IS NOT NULL
            AND json_extract(triggered_by_user_ids, '$') LIKE '%' || OLD.user_id || '%'
      )
      BEGIN
          -- Update notifications by removing the user from the array
          UPDATE notifications
          SET triggered_by_user_ids = (
              SELECT CASE 
                  WHEN COUNT(*) = 0 THEN NULL
                  ELSE json_group_array(value)
              END
              FROM json_each(triggered_by_user_ids)
              WHERE value != OLD.user_id
          )
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = OLD.title
            AND notification_status = 'active'
            AND triggered_by_user_ids IS NOT NULL;
          
          -- Delete notifications that have no users left
          DELETE FROM notifications
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = OLD.title
            AND notification_status = 'active'
            AND (triggered_by_user_ids IS NULL 
                 OR triggered_by_user_ids = '[]' 
                 OR json_array_length(triggered_by_user_ids) = 0);
      END;
    `)
  }
}

/**
 * Drops the triggers, functions, column and index for both PostgreSQL and SQLite.
 */
export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    // PostgreSQL cleanup
    await knex.raw(
      'DROP TRIGGER IF EXISTS watchlist_add_trigger ON watchlist_items',
    )
    await knex.raw(
      'DROP TRIGGER IF EXISTS watchlist_remove_trigger ON watchlist_items',
    )
    await knex.raw(
      'DROP FUNCTION IF EXISTS update_public_notifications_on_watchlist_add()',
    )
    await knex.raw(
      'DROP FUNCTION IF EXISTS update_public_notifications_on_watchlist_remove()',
    )
    // No indexes created for either database
  } else {
    // SQLite cleanup
    await knex.raw('DROP TRIGGER IF EXISTS watchlist_add_trigger')
    await knex.raw('DROP TRIGGER IF EXISTS watchlist_remove_trigger')
    // No indexes created for either database
  }

  // Drop column (works for both databases)
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('triggered_by_user_ids')
  })
}
