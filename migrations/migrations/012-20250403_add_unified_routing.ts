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
  
  // Now that we've migrated all the data, we can drop the original tables
  await knex.schema.dropTable('sonarr_genre_routing')
  await knex.schema.dropTable('radarr_genre_routing')
}

export async function down(knex: Knex): Promise<void> {
  // First recreate the original genre routing tables
  await knex.schema.createTable('sonarr_genre_routing', (table) => {
    table.increments('id').primary()
    table.integer('sonarr_instance_id')
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
    table.integer('radarr_instance_id')
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
  
  // Migrate data back from router_rules to the genre-specific tables
  const rules = await knex('router_rules')
    .where('type', 'genre')
    .select('*')
  
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
        updated_at: rule.updated_at
      })
    } else if (rule.target_type === 'radarr') {
      await knex('radarr_genre_routing').insert({
        radarr_instance_id: rule.target_instance_id,
        name: rule.name,
        genre: criteria.genre,
        root_folder: rule.root_folder,
        quality_profile: rule.quality_profile,
        created_at: rule.created_at,
        updated_at: rule.updated_at
      })
    }
  }
  
  // Drop the router_rules table
  await knex.schema.dropTable('router_rules')
}