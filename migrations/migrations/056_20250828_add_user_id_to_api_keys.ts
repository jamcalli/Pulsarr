import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    const adminCount = await trx('admin_users').count('* as count').first()
    const hasAdmins = Number(adminCount?.count || 0) > 0

    const existingApiKeys = await trx('api_keys').count('* as count').first()
    const apiKeyCount = Number(existingApiKeys?.count || 0)

    if (!hasAdmins) {
      console.log(
        '⚠️  No admin users found - this appears to be a fresh installation',
      )
      console.log(
        '   Creating user_id column as nullable - API keys will be assigned when admin users are created',
      )

      await trx.schema.alterTable('api_keys', (table) => {
        table.integer('user_id').nullable()
        table
          .foreign('user_id')
          .references('id')
          .inTable('admin_users')
          .onDelete('CASCADE')

        table.index(['user_id'], 'idx_api_keys_user_id')
      })

      console.log(
        `✓ Migration completed for fresh install: Created user_id column for ${apiKeyCount} API key(s)`,
      )
      return
    }

    const adminUser = await trx('admin_users')
      .where('role', 'admin')
      .orderBy('id', 'asc')
      .first()

    if (!adminUser) {
      throw new Error(
        'Migration failed: No admin user found. ' +
          'Cannot proceed with API key user association.',
      )
    }

    console.log(
      `✓ Found admin user: ${adminUser.username} (ID: ${adminUser.id}, Role: ${adminUser.role})`,
    )

    console.log(
      `✓ Associating ${apiKeyCount} existing API key(s) with admin user`,
    )

    await trx.schema.alterTable('api_keys', (table) => {
      table.integer('user_id').nullable()
      table
        .foreign('user_id')
        .references('id')
        .inTable('admin_users')
        .onDelete('CASCADE')

      // Add index for efficient user-based API key queries
      table.index(['user_id'], 'idx_api_keys_user_id')
    })

    const updatedRows = await trx('api_keys')
      .update({ user_id: adminUser.id })
      .whereNull('user_id')

    await trx.schema.alterTable('api_keys', (table) => {
      table.integer('user_id').notNullable().alter()
    })

    console.log(
      `✓ Migration completed: Associated ${apiKeyCount} API key(s) with admin user ${adminUser.username}`,
    )

    if (updatedRows > 0) {
      console.log(
        `✓ Updated ${updatedRows} existing API key(s) with user_id = ${adminUser.id}`,
      )
    }
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropForeign(['user_id'])
    table.dropIndex(['user_id'])
    table.dropColumn('user_id')
  })

  console.log('✓ Reverted: Removed user_id column from api_keys table')
}
