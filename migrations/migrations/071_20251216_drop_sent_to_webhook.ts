import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

/**
 * Cleans up deprecated notification infrastructure:
 *
 * 1. Drops `sent_to_webhook` column - redundant with `type` column
 *    (sent_to_webhook=true meant type='watchlist_add', false meant media availability)
 *
 * 2. Drops `triggered_by_user_ids` column - never used by application code
 *
 * 3. Drops watchlist triggers - dead code that amended already-delivered notifications
 *    (architecturally nonsensical: modifying historical records serves no purpose)
 */
export async function up(knex: Knex): Promise<void> {
  // Drop the dead triggers first
  if (isPostgreSQL(knex)) {
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
  } else {
    await knex.raw('DROP TRIGGER IF EXISTS watchlist_add_trigger')
    await knex.raw('DROP TRIGGER IF EXISTS watchlist_remove_trigger')
  }

  // Drop the unused columns
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('sent_to_webhook')
    table.dropColumn('triggered_by_user_ids')
  })
}

/**
 * Restores the columns and triggers for rollback.
 * Note: triggers are recreated but remain unused by application code.
 */
export async function down(knex: Knex): Promise<void> {
  const isPostgres = isPostgreSQL(knex)

  // Restore columns
  await knex.schema.alterTable('notifications', (table) => {
    table.boolean('sent_to_webhook').defaultTo(false)
    if (isPostgres) {
      table.jsonb('triggered_by_user_ids').nullable()
    } else {
      table.json('triggered_by_user_ids').nullable()
    }
  })

  // Restore triggers (even though they're dead code, for complete rollback)
  if (isPostgres) {
    await knex.raw(`
      CREATE OR REPLACE FUNCTION update_public_notifications_on_watchlist_add()
      RETURNS TRIGGER AS $$
      BEGIN
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
          RAISE WARNING 'Error in watchlist_add_trigger: %', SQLERRM;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    await knex.raw(`
      CREATE OR REPLACE FUNCTION update_public_notifications_on_watchlist_remove()
      RETURNS TRIGGER AS $$
      BEGIN
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

          DELETE FROM notifications
          WHERE user_id IS NULL
            AND watchlist_item_id IS NULL
            AND title = OLD.title
            AND notification_status = 'active'
            AND (triggered_by_user_ids IS NULL
                 OR triggered_by_user_ids = '[]'::jsonb);
          RETURN OLD;
      EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Error in watchlist_remove_trigger: %', SQLERRM;
          RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `)

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
