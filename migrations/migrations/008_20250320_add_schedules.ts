import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 008_20250320_add_schedules - PostgreSQL uses consolidated schema in migration 034')
    return
  }
await knex.schema.createTable('schedules', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()  // Unique name for the scheduled job
    table.string('type').notNullable()           // 'interval' or 'cron'
    table.json('config').notNullable()           // Configuration for the schedule
    table.boolean('enabled').defaultTo(true)
    table.json('last_run').nullable()            // Info about last execution
    table.json('next_run').nullable()            // Expected next run time
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    
    table.index('name')
    table.index('enabled')
  })
  
  // Add default delete-sync schedule
  await knex('schedules').insert([
    {
      name: 'delete-sync',
      type: 'cron',
      config: JSON.stringify({ 
        expression: '0 1 * * 0' // Every Sunday at 1:00 AM
      }),
      enabled: false,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }
  ])
}

export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  await knex.schema.dropTable('schedules')
}