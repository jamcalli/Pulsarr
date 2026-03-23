import type { Knex } from 'knex'

/**
 * Migrates the database to add a `triggered_by_user_ids` JSON column to the `notifications` table, tracking user IDs whose watchlist items trigger public notifications.
 *
 * Populates this column for existing public notifications and creates database triggers to automatically update the array when watchlist items are added or removed. Deletes notifications when no users remain associated. Supports both PostgreSQL and SQLite.
 */
export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  await knex.schema.alterTable('notifications', (table) => {
    // Add JSON column to store array of user IDs who have this item in their watchlist
    table.jsonb('triggered_by_user_ids').nullable()
  })

  // Populate existing public notification records with associated user IDs in a single set-based operation
  if (isPostgres) {
    // PostgreSQL: Use UPDATE ... FROM with jsonb aggregation
    await knex.raw(`
      UPDATE notifications 
      SET triggered_by_user_ids = user_aggregates.user_ids
      FROM (
        SELECT 
          n.id,
          COALESCE(jsonb_agg(DISTINCT w.user_id), '[]'::jsonb) as user_ids
        FROM notifications n
        LEFT JOIN watchlist_items w ON w.title = n.title
        WHERE n.user_id IS NULL 
          AND n.watchlist_item_id IS NULL 
          AND n.notification_status = 'active'
        GROUP BY n.id
      ) user_aggregates
      WHERE notifications.id = user_aggregates.id
        AND user_aggregates.user_ids != '[]'::jsonb
    `)
  } else {
    // SQLite: Use correlated subquery with json_group_array
    await knex.raw(`
      UPDATE notifications 
      SET triggered_by_user_ids = (
        SELECT json_group_array(DISTINCT w.user_id)
        FROM watchlist_items w
        WHERE w.title = notifications.title
      )
      WHERE user_id IS NULL 
        AND watchlist_item_id IS NULL 
        AND notification_status = 'active'
        AND EXISTS (
          SELECT 1 FROM watchlist_items w2 
          WHERE w2.title = notifications.title
        )
    `)
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
                  jsonb_build_array(NEW.user_id)
              WHEN NOT (triggered_by_user_ids @> jsonb_build_array(NEW.user_id)) THEN 
                  triggered_by_user_ids || jsonb_build_array(NEW.user_id)
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
                  ELSE jsonb_agg(elem)
              END
              FROM jsonb_array_elements(triggered_by_user_ids) AS elem
              WHERE elem != to_jsonb(OLD.user_id)
          )
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = OLD.title
            AND notification_status = 'active'
            AND triggered_by_user_ids IS NOT NULL
            AND triggered_by_user_ids @> jsonb_build_array(OLD.user_id);

          -- Delete notifications that have no users left
          DELETE FROM notifications
          WHERE user_id IS NULL 
            AND watchlist_item_id IS NULL
            AND title = OLD.title
            AND notification_status = 'active'
            AND (triggered_by_user_ids IS NULL 
                 OR triggered_by_user_ids = '[]'::jsonb);

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
              WHEN NOT EXISTS (
                  SELECT 1 FROM json_each(triggered_by_user_ids) 
                  WHERE value = NEW.user_id
              ) THEN
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
            AND EXISTS (
                SELECT 1 FROM json_each(triggered_by_user_ids) 
                WHERE value = OLD.user_id
            )
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
 * Reverts the migration by removing the `triggered_by_user_ids` column and associated triggers and functions from the database.
 *
 * Drops the triggers and trigger functions for PostgreSQL or triggers for SQLite, and removes the `triggered_by_user_ids` column from the `notifications` table.
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
