import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Create new watchlist_items table with 'removed' status
  await knex.raw(`
    CREATE TABLE watchlist_items_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      key TEXT NOT NULL,
      type TEXT NOT NULL,
      thumb TEXT,
      added TEXT,
      guids JSON,
      genres JSON,
      status TEXT NOT NULL CHECK(status IN ('pending', 'requested', 'grabbed', 'notified', 'removed')) DEFAULT 'pending',
      last_notified_at TIMESTAMP,
      series_status TEXT CHECK(series_status IN ('continuing', 'ended')),
      movie_status TEXT CHECK(movie_status IN ('available', 'unavailable')),
      sonarr_instance_id INTEGER,
      radarr_instance_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(sonarr_instance_id) REFERENCES sonarr_instances(id) ON DELETE SET NULL,
      FOREIGN KEY(radarr_instance_id) REFERENCES radarr_instances(id) ON DELETE SET NULL
    )
  `);

  // Copy data from old table to new table
  await knex.raw(`INSERT INTO watchlist_items_new SELECT * FROM watchlist_items`);

  // Drop old table
  await knex.raw(`DROP TABLE watchlist_items`);

  // Rename new table
  await knex.raw(`ALTER TABLE watchlist_items_new RENAME TO watchlist_items`);

  // Recreate indexes for watchlist_items - one at a time
  await knex.raw(`CREATE UNIQUE INDEX idx_watchlist_items_user_key ON watchlist_items(user_id, key)`);
  await knex.raw(`CREATE INDEX idx_watchlist_items_user_id ON watchlist_items(user_id)`);
  await knex.raw(`CREATE INDEX idx_watchlist_items_guids ON watchlist_items(guids)`);
  await knex.raw(`CREATE INDEX idx_watchlist_items_sonarr_instance_id ON watchlist_items(sonarr_instance_id)`);
  await knex.raw(`CREATE INDEX idx_watchlist_items_radarr_instance_id ON watchlist_items(radarr_instance_id)`);

  // Create new watchlist_status_history table
  await knex.raw(`
    CREATE TABLE watchlist_status_history_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_item_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'requested', 'grabbed', 'notified', 'removed')),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(watchlist_item_id) REFERENCES watchlist_items(id) ON DELETE CASCADE
    )
  `);

  // Copy data
  await knex.raw(`INSERT INTO watchlist_status_history_new SELECT * FROM watchlist_status_history`);

  // Drop old table
  await knex.raw(`DROP TABLE watchlist_status_history`);

  // Rename new table
  await knex.raw(`ALTER TABLE watchlist_status_history_new RENAME TO watchlist_status_history`);

  // Recreate indexes - one at a time
  await knex.raw(`CREATE INDEX idx_watchlist_status_history_item_status ON watchlist_status_history(watchlist_item_id, status)`);
  await knex.raw(`CREATE INDEX idx_watchlist_status_history_timestamp ON watchlist_status_history(timestamp)`);

  // Create new watchlist_radarr_instances table
  await knex.raw(`
    CREATE TABLE watchlist_radarr_instances_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      radarr_instance_id INTEGER NOT NULL,
      is_primary BOOLEAN DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('pending', 'requested', 'grabbed', 'notified', 'removed')) DEFAULT 'pending',
      last_notified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      syncing BOOLEAN DEFAULT 0 NOT NULL,
      FOREIGN KEY(watchlist_id) REFERENCES watchlist_items(id) ON DELETE CASCADE,
      FOREIGN KEY(radarr_instance_id) REFERENCES radarr_instances(id) ON DELETE CASCADE
    )
  `);

  // Copy data
  await knex.raw(`INSERT INTO watchlist_radarr_instances_new SELECT * FROM watchlist_radarr_instances`);

  // Drop old table
  await knex.raw(`DROP TABLE watchlist_radarr_instances`);

  // Rename new table
  await knex.raw(`ALTER TABLE watchlist_radarr_instances_new RENAME TO watchlist_radarr_instances`);

  // Recreate indexes - one at a time
  await knex.raw(`CREATE UNIQUE INDEX idx_watchlist_radarr_instances_unique ON watchlist_radarr_instances(watchlist_id, radarr_instance_id)`);
  await knex.raw(`CREATE INDEX idx_watchlist_radarr_instances_lookup ON watchlist_radarr_instances(watchlist_id, radarr_instance_id)`);
  await knex.raw(`CREATE INDEX idx_watchlist_radarr_instances_primary ON watchlist_radarr_instances(is_primary)`);
  await knex.raw(`CREATE INDEX idx_watchlist_radarr_instances_syncing ON watchlist_radarr_instances(syncing)`);

  // Create new watchlist_sonarr_instances table
  await knex.raw(`
    CREATE TABLE watchlist_sonarr_instances_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      sonarr_instance_id INTEGER NOT NULL,
      is_primary BOOLEAN DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('pending', 'requested', 'grabbed', 'notified', 'removed')) DEFAULT 'pending',
      last_notified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      syncing BOOLEAN DEFAULT 0 NOT NULL,
      FOREIGN KEY(watchlist_id) REFERENCES watchlist_items(id) ON DELETE CASCADE,
      FOREIGN KEY(sonarr_instance_id) REFERENCES sonarr_instances(id) ON DELETE CASCADE
    )
  `);

  // Copy data
  await knex.raw(`INSERT INTO watchlist_sonarr_instances_new SELECT * FROM watchlist_sonarr_instances`);

  // Drop old table
  await knex.raw(`DROP TABLE watchlist_sonarr_instances`);

  // Rename new table
  await knex.raw(`ALTER TABLE watchlist_sonarr_instances_new RENAME TO watchlist_sonarr_instances`);

  // Recreate indexes - one at a time
  await knex.raw(`CREATE UNIQUE INDEX idx_watchlist_sonarr_instances_unique ON watchlist_sonarr_instances(watchlist_id, sonarr_instance_id)`);
  await knex.raw(`CREATE INDEX idx_watchlist_sonarr_instances_lookup ON watchlist_sonarr_instances(watchlist_id, sonarr_instance_id)`);
  await knex.raw(`CREATE INDEX idx_watchlist_sonarr_instances_primary ON watchlist_sonarr_instances(is_primary)`);
  await knex.raw(`CREATE INDEX idx_watchlist_sonarr_instances_syncing ON watchlist_sonarr_instances(syncing)`);
}

export async function down(knex: Knex): Promise<void> {
  // This would be complex to undo since we'd need to restore the original enum values
  throw new Error('This migration cannot be undone once applied. You would need to restore from a backup.');
}