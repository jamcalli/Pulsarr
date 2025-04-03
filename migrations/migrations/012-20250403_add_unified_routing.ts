import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Create the router_rules table
  await knex.schema.createTable('router_rules', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.string('type').notNullable()  // Plugin type: 'genre', 'user', 'time', etc.
    table.json('criteria').notNullable() // Flexible JSON structure for criteria
    table.string('target_type').notNullable() // 'sonarr' or 'radarr'
    table.integer('target_instance_id').notNullable()
    table.string('root_folder')
    table.integer('quality_profile')
    table.integer('order').defaultTo(50)
    table.boolean('enabled').defaultTo(true)
    table.json('metadata').nullable()    // For plugin-specific extra data
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    
    // Add appropriate indexes
    table.index(['type', 'enabled'])
    table.index('target_type')
    table.index('target_instance_id')
  })
  
  // Migrate Sonarr genre routes to the new table
  const sonarrRoutes = await knex('sonarr_genre_routing').select('*')
  
  for (const route of sonarrRoutes) {
    await knex('router_rules').insert({
      name: route.name,
      type: 'genre',
      criteria: JSON.stringify({ genre: route.genre }),
      target_type: 'sonarr',
      target_instance_id: route.sonarr_instance_id,
      root_folder: route.root_folder,
      quality_profile: route.quality_profile,
      order: 50, // Default priority
      enabled: true,
      created_at: route.created_at,
      updated_at: route.updated_at
    })
  }
  
  // Migrate Radarr genre routes to the new table
  const radarrRoutes = await knex('radarr_genre_routing').select('*')
  
  for (const route of radarrRoutes) {
    await knex('router_rules').insert({
      name: route.name,
      type: 'genre',
      criteria: JSON.stringify({ genre: route.genre }),
      target_type: 'radarr',
      target_instance_id: route.radarr_instance_id,
      root_folder: route.root_folder,
      quality_profile: route.quality_profile,
      order: 50, // Default priority
      enabled: true,
      created_at: route.created_at,
      updated_at: route.updated_at
    })
  }
  
  // We're keeping the original tables for now to avoid breaking existing functionality
  // A future migration could remove them once the new system is fully implemented
}

export async function down(knex: Knex): Promise<void> {
  // Drop the router_rules table
  await knex.schema.dropTable('router_rules')
  
  // The original genre routing tables will still exist since we didn't drop them
}