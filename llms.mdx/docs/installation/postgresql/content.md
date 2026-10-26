# PostgreSQL (/installation/postgresql)

Pulsarr uses SQLite by default and needs no setup for it. You can use PostgreSQL instead, either from the first start or by moving an existing SQLite install across.

Pulsarr creates the tables, but not the database. Create an empty database owned by your user first:

```sql
CREATE DATABASE pulsarr OWNER your_username;
```

On PostgreSQL 15 and later, `GRANT ALL PRIVILEGES ON DATABASE` does not allow creating tables in the `public` schema, so make the user the owner instead.

## Start on PostgreSQL [#start-on-postgresql]

Add the connection to `.env` before Pulsarr starts for the first time:

```bash
dbType=postgres
dbHost=your-postgres-host
dbPort=5432
dbName=pulsarr
dbUser=your_username
dbPassword=your-password
```

Or give the whole connection as `dbConnectionString=postgresql://user:password@host:5432/pulsarr`, which is used instead of the separate settings. Pulsarr sets up the tables when it starts.

## Move from SQLite [#move-from-sqlite]

These steps use Docker and the [`docker-compose.migration.yml`](https://github.com/jamcalli/Pulsarr/blob/master/docker-compose.migration.yml) from the repository. Put it next to your `docker-compose.yml`.

1. Stop Pulsarr with `docker compose down`.
2. Bring the SQLite database up to date, with `.env` still set to SQLite:

   ```bash
   docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-sqlite
   ```

3. Add the PostgreSQL settings above to `.env`.
4. Create the tables in PostgreSQL:

   ```bash
   docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-postgres-setup
   ```

5. Copy the data across. It asks you to confirm before it copies:

   ```bash
   docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data
   ```

   It checks both connections, backs up the SQLite database to `./data/backups/`, copies every table and checks that the row counts match. After the copy it moves each PostgreSQL ID sequence up to the highest copied ID, so new rows don't collide. It refuses a table that already has rows and stops at the first table that fails. After a failed run, recreate the database and run step 4 again.

6. Start Pulsarr with `docker compose up -d`.

To see progress for each batch, run the copy step with the script's full command and `--verbose`. `--batch-size=N` sets how many rows go per insert. `--help` lists the options.

```bash
docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data bun run --bun migrations/scripts/sqlite-to-postgresql.ts --verbose
```

## Go back to SQLite [#go-back-to-sqlite]

Stop Pulsarr, remove the PostgreSQL settings from `.env` so `dbType` is back to `sqlite`, and start it again. Your SQLite database is still in `./data/db/`, and the copy made before the move is in `./data/backups/`.
