import type { Knex } from 'knex'
import { isSQLite } from '../utils/clientDetection.js'

// SQLite's ALTER COLUMN rebuilds the table (create temp table, copy rows,
// drop original, rename temp back) rather than altering in place. The
// fk_router_rules_sonarr_delete/fk_router_rules_radarr_delete triggers
// (created in migration 012) reference router_rules by name, and SQLite
// validates trigger bodies during the rename step - while the temp table is
// being renamed back to router_rules, the original no longer exists, so the
// rename fails with "no such table: main.router_rules". Dropping the
// triggers before the alter and recreating them after avoids this.
// Postgres doesn't rebuild the table for a nullable change, so this is
// SQLite-only.

async function dropRouterRuleTriggers(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS fk_router_rules_sonarr_delete')
  await knex.raw('DROP TRIGGER IF EXISTS fk_router_rules_radarr_delete')
}

async function createRouterRuleTriggers(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TRIGGER fk_router_rules_sonarr_delete
    BEFORE DELETE ON sonarr_instances
    FOR EACH ROW
    BEGIN
      DELETE FROM router_rules
      WHERE target_type = 'sonarr' AND target_instance_id = OLD.id;
    END;
  `)

  await knex.raw(`
    CREATE TRIGGER fk_router_rules_radarr_delete
    BEFORE DELETE ON radarr_instances
    FOR EACH ROW
    BEGIN
      DELETE FROM router_rules
      WHERE target_type = 'radarr' AND target_instance_id = OLD.id;
    END;
  `)
}

export async function up(knex: Knex): Promise<void> {
  const sqlite = isSQLite(knex)

  if (sqlite) {
    await dropRouterRuleTriggers(knex)
  }

  await knex.schema.alterTable('router_rules', (table) => {
    table.boolean('exclude_from_routing').defaultTo(false)
    table.integer('target_instance_id').nullable().alter()
  })

  if (sqlite) {
    await createRouterRuleTriggers(knex)
  }
}

export async function down(knex: Knex): Promise<void> {
  const sqlite = isSQLite(knex)

  if (sqlite) {
    await dropRouterRuleTriggers(knex)
  }

  await knex.schema.alterTable('router_rules', (table) => {
    table.integer('target_instance_id').notNullable().alter()
    table.dropColumn('exclude_from_routing')
  })

  if (sqlite) {
    await createRouterRuleTriggers(knex)
  }
}
