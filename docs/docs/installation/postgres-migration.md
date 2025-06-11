---
sidebar_position: 3
---

# Migrating from SQLite to PostgreSQL

Pulsarr supports both SQLite and PostgreSQL databases. This guide will help you migrate your existing SQLite data to PostgreSQL.

## Prerequisites

Before starting the migration, ensure you have:

1. **Existing Pulsarr installation** running on SQLite
2. **PostgreSQL server** running and accessible
3. **PostgreSQL database created** - You must manually create an empty database (e.g., `pulsarr`) before migration
4. **Database user with permissions** - Ensure the user has ALL PRIVILEGES on the database
5. **Database backup** (the migration script creates one automatically, but having your own is recommended)
6. **Network access** from Pulsarr container to PostgreSQL database

:::warning Create Database First
You must create an empty PostgreSQL database before running the migration. The migration script will create tables and migrate data, but it will **not** create the database itself.

```sql
-- Example: Connect to PostgreSQL and create database
CREATE DATABASE pulsarr;
-- Grant permissions to your user
GRANT ALL PRIVILEGES ON DATABASE pulsarr TO your_username;
```
:::

## Migration Process

The migration involves three main steps:

1. **Update SQLite** to the latest schema
2. **Setup PostgreSQL** with the same schema
3. **Migrate data** from SQLite to PostgreSQL

### Step 1: Create Migration Compose File

Create a `docker-compose.migration.yml` file in your Pulsarr directory:

```yaml
services:
  # Step 1: Update SQLite to latest migrations
  pulsarr-migrate-sqlite:
    image: lakker/pulsarr:latest
    container_name: pulsarr-migrate-sqlite
    volumes:
      - ./data:/app/data
      - .env:/app/.env
    env_file:
      - .env
    profiles:
      - migration
    command: npm run migrate

  # Step 2: Setup PostgreSQL schema  
  pulsarr-migrate-postgres-setup:
    image: lakker/pulsarr:latest
    container_name: pulsarr-migrate-postgres-setup
    volumes:
      - ./data:/app/data
      - .env:/app/.env
    env_file:
      - .env
    profiles:
      - migration
    command: npm run migrate:postgres-setup

  # Step 3: Migrate data from SQLite to PostgreSQL
  pulsarr-migrate-data:
    image: lakker/pulsarr:latest
    container_name: pulsarr-migrate-data
    volumes:
      - ./data:/app/data
      - .env:/app/.env
    env_file:
      - .env
    profiles:
      - migration
    stdin_open: true
    tty: true
    command: npm run migrate:sqlite-to-postgres
```

### Step 2: Update SQLite Schema

Ensure your SQLite database is on the latest migration:

```bash
# This runs with your current SQLite settings
docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-sqlite
```

### Step 3: Configure PostgreSQL Settings

Update your `.env` file with PostgreSQL configuration. You can use either individual connection parameters or a connection string.

#### Option A: Individual Parameters

```env
# Database Configuration
dbType=postgres
dbHost=your-postgres-host
dbPort=5432
dbName=pulsarr
dbUser=postgres
dbPassword=your-secure-password
```

#### Option B: Connection String

```env
# Database Configuration
dbType=postgres
dbConnectionString=postgresql://username:password@host:port/database

# Example:
# dbConnectionString=postgresql://postgres:mypassword@localhost:5432/pulsarr
# dbConnectionString=postgresql://user:pass@postgres.example.com:5432/pulsarr_db
```

:::info Connection Priority
If both `dbConnectionString` and individual parameters are provided, the connection string takes priority.
:::

### Step 4: Setup PostgreSQL Schema

Create the database schema in PostgreSQL:

```bash
# This runs with your new PostgreSQL settings
docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-postgres-setup
```

### Step 5: Migrate Your Data

Run the data migration script:

```bash
# Interactive mode (will prompt for confirmation before proceeding)
docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data
```

#### Non-Interactive Migration

For automated deployments or if you want to skip the confirmation prompt:

```bash
# Auto-confirm migration (non-interactive)
echo "y" | docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data
```

#### Migration Command Options

You can pass additional options to the migration script:

```bash
# Show help and available options
docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data npx tsx migrations/scripts/sqlite-to-postgresql.ts --help

# Verbose output (shows detailed progress for each batch)
echo "y" | docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data npx tsx migrations/scripts/sqlite-to-postgresql.ts --verbose

# Custom batch size (default: 1000 rows per batch)
echo "y" | docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data npx tsx migrations/scripts/sqlite-to-postgresql.ts --batch-size=500
```

The script will:
- ✅ Verify connections to both databases
- ✅ Create a backup of your SQLite database
- ✅ Show migration summary and ask for confirmation (unless auto-confirmed)
- ✅ Migrate all data with proper type conversions
- ✅ Update PostgreSQL auto-increment sequences
- ✅ Verify migration completed successfully

### Step 6: Verify Migration

After migration completes successfully, verify everything migrated correctly:

1. **Check the migration output** - Look for:
   - ✅ "All row counts match!" 
   - ✅ Total number of migrated rows
   - ✅ Backup location

2. **Verify your .env configuration** - Ensure PostgreSQL settings are active:
   ```env
   dbType=postgres
   # Your PostgreSQL connection settings should be uncommented/active
   ```

### Step 7: Start Pulsarr

Once migration is verified, start Pulsarr normally:

```bash
docker compose up -d
```

Pulsarr will now use your PostgreSQL database!

**First startup verification:**
- Check the logs: `docker compose logs pulsarr`
- Verify the web interface loads correctly
- Test a few key functions (viewing watchlists, checking settings)

## Environment Variables Reference

These variables must be configured in your `.env` file for the migration:

### Required for PostgreSQL
- `dbType=postgres` - Enables PostgreSQL mode
- `dbHost` - PostgreSQL server hostname (e.g., `localhost`)
- `dbPort` - PostgreSQL server port (default: `5432`)
- `dbName` - Database name (e.g., `pulsarr`)
- `dbUser` - Database username (e.g., `postgres`)
- `dbPassword` - Database password

### Alternative: Connection String
- `dbConnectionString` - Full PostgreSQL URL (takes priority over individual settings)
  - Format: `postgresql://username:password@host:port/database`

### For Rollback to SQLite
- `dbType=sqlite` - Switch back to SQLite mode
- `dbPath=./data/db/pulsarr.db` - SQLite file path

## Advanced Options

```bash
# Automated migration (skip confirmation)
echo "y" | docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data

# Custom batch size for large databases
echo "y" | docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data npx tsx migrations/scripts/sqlite-to-postgresql.ts --batch-size=500
```

## Troubleshooting

### Connection Issues

**Error: Database connection failed**
- Verify PostgreSQL is running and accessible
- Check your connection settings in `.env`
- Ensure firewall allows connections on the specified port
- Test connection with a PostgreSQL client first

### Permission Issues

**Error: Permission denied**
- Ensure the database user has ALL PRIVILEGES on the database
- Check the database connection string/parameters in your `.env` file

### Schema Mismatch

**Error: Table doesn't exist**
- Make sure you ran Step 4 (PostgreSQL schema setup) before data migration
- Verify both databases are on the same migration version

### Data Type Issues

**Error: Invalid input syntax**
- The migration script handles most type conversions automatically
- If you encounter issues, check the logs for specific data that's causing problems

## Rollback

If you need to rollback to SQLite:

1. **Stop Pulsarr**
2. **Update `.env`** to use SQLite settings:
   ```env
   dbType=sqlite
   dbPath=./data/db/pulsarr.db
   ```
3. **Restore from backup** if needed (located in `./data/backups/`)
4. **Start Pulsarr**

## Post-Migration Notes

- **Backup location**: Automatic SQLite backup is created in `./data/backups/`
- **Monitoring**: Check logs after migration to ensure everything is working correctly
- **Cleanup**: You can safely delete the SQLite backup after confirming PostgreSQL works correctly