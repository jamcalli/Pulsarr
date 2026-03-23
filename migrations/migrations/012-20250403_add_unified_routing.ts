import type { Knex } from 'knex'
import { isPostgreSQL } from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  // Skip this migration for PostgreSQL - it's included in migration 034
  if (isPostgreSQL(knex)) {
    console.log(
      'Skipping migration 012-20250403_add_unified_routing - PostgreSQL uses consolidated schema in migration 034',
    )
    return
  }

  await knex.transaction(async (trx) => {
    await trx.schema.createTable('router_rules', (table) => {
      table.increments('id').primary()
      table.string('name').notNullable()
      table.string('type').notNullable()
      table.json('criteria').notNullable()
      table.string('target_type').notNullable()
      table.integer('target_instance_id').notNullable()
      table.string('root_folder')
      table.integer('quality_profile')
      table.integer('order').defaultTo(50)
      table.boolean('enabled').defaultTo(true)
      table.json('metadata').nullable()
      table.timestamp('created_at').defaultTo(trx.fn.now())
      table.timestamp('updated_at').defaultTo(trx.fn.now())

      table.index(['type', 'enabled'])
      table.index('target_type')
      table.index('target_instance_id')
    })

    // Triggers for cascading deletes - can't use normal FKs since target_instance_id is polymorphic
    await trx.raw(`
      CREATE TRIGGER fk_router_rules_sonarr_delete
      BEFORE DELETE ON sonarr_instances
      FOR EACH ROW
      BEGIN
        DELETE FROM router_rules 
        WHERE target_type = 'sonarr' AND target_instance_id = OLD.id;
      END;
    `)

    await trx.raw(`
      CREATE TRIGGER fk_router_rules_radarr_delete
      BEFORE DELETE ON radarr_instances
      FOR EACH ROW
      BEGIN
        DELETE FROM router_rules 
        WHERE target_type = 'radarr' AND target_instance_id = OLD.id;
      END;
    `)

    const sonarrRoutes = await knex('sonarr_genre_routing').select('*')

    for (const route of sonarrRoutes) {
      await trx('router_rules').insert({
        name: route.name,
        type: 'genre',
        criteria: JSON.stringify({ genre: route.genre }),
        target_type: 'sonarr',
        target_instance_id: route.sonarr_instance_id,
        root_folder: route.root_folder,
        quality_profile: route.quality_profile,
        order: 50,
        enabled: true,
        created_at: route.created_at,
        updated_at: route.updated_at,
      })
    }

    const radarrRoutes = await knex('radarr_genre_routing').select('*')

    for (const route of radarrRoutes) {
      await trx('router_rules').insert({
        name: route.name,
        type: 'genre',
        criteria: JSON.stringify({ genre: route.genre }),
        target_type: 'radarr',
        target_instance_id: route.radarr_instance_id,
        root_folder: route.root_folder,
        quality_profile: route.quality_profile,
        order: 50,
        enabled: true,
        created_at: route.created_at,
        updated_at: route.updated_at,
      })
    }

    await trx.schema.dropTable('sonarr_genre_routing')
    await trx.schema.dropTable('radarr_genre_routing')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Skip this migration for PostgreSQL - it's included in migration 034
  if (isPostgreSQL(knex)) {
    console.log(
      'Skipping migration 012-20250403_add_unified_routing rollback - PostgreSQL uses consolidated schema in migration 034',
    )
    return
  }

  await knex.raw('DROP TRIGGER IF EXISTS fk_router_rules_sonarr_delete')
  await knex.raw('DROP TRIGGER IF EXISTS fk_router_rules_radarr_delete')

  await knex.schema.createTable('sonarr_genre_routing', (table) => {
    table.increments('id').primary()
    table
      .integer('sonarr_instance_id')
      .references('id')
      .inTable('sonarr_instances')
      .onDelete('CASCADE')
    table.string('name').notNullable()
    table.string('genre').notNullable()
    table.string('root_folder').notNullable()
    table.integer('quality_profile').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['sonarr_instance_id', 'genre'])
    table.index(['sonarr_instance_id', 'genre'])
    table.index('name')
  })

  await knex.schema.createTable('radarr_genre_routing', (table) => {
    table.increments('id').primary()
    table
      .integer('radarr_instance_id')
      .references('id')
      .inTable('radarr_instances')
      .onDelete('CASCADE')
    table.string('name').notNullable()
    table.string('genre').notNullable()
    table.string('root_folder').notNullable()
    table.integer('quality_profile').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['radarr_instance_id', 'genre'])
    table.index(['radarr_instance_id', 'genre'])
    table.index('name')
  })

  const rules = await knex('router_rules').where('type', 'genre').select('*')

  for (const rule of rules) {
    const criteria = JSON.parse(rule.criteria)

    if (rule.target_type === 'sonarr') {
      await knex('sonarr_genre_routing').insert({
        sonarr_instance_id: rule.target_instance_id,
        name: rule.name,
        genre: criteria.genre,
        root_folder: rule.root_folder,
        quality_profile: rule.quality_profile,
        created_at: rule.created_at,
        updated_at: rule.updated_at,
      })
    } else if (rule.target_type === 'radarr') {
      await knex('radarr_genre_routing').insert({
        radarr_instance_id: rule.target_instance_id,
        name: rule.name,
        genre: criteria.genre,
        root_folder: rule.root_folder,
        quality_profile: rule.quality_profile,
        created_at: rule.created_at,
        updated_at: rule.updated_at,
      })
    }
  }

  await knex.schema.dropTable('router_rules')
}
