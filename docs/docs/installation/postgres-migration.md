# Migrating from SQLite to PostgreSQL

Pulsarr supports both SQLite and PostgreSQL databases. This guide will help you migrate your existing SQLite data to PostgreSQL.

## Prerequisites

Before starting the migration, ensure you have:

1. **Existing Pulsarr installation** running on SQLite
2. **PostgreSQL server** running and accessible
3. **PostgreSQL database created** - You must manually create an empty database (e.g., `pulsarr`) before migration
4. **Database user with permissions** - Ensure the user has CREATE, INSERT, UPDATE, DELETE, and DROP privileges on the database
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

### Step 1: Prepare Migration Files

Download the migration compose file:

```bash
# Create the migration compose file
cat > docker-compose.migration.yml << 'EOF'
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
EOF
```

### Step 2: Update SQLite Schema

Ensure your SQLite database is on the latest migration:

```bash
# This runs with your current SQLite settings
docker-compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-sqlite
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
docker-compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-postgres-setup
```

### Step 5: Migrate Your Data

Run the data migration script:

```bash
# This will prompt for confirmation before proceeding
docker-compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data
```

The script will:
- ✅ Verify connections to both databases
- ✅ Create a backup of your SQLite database
- ✅ Show migration summary and ask for confirmation
- ✅ Migrate all data with proper type conversions
- ✅ Update PostgreSQL auto-increment sequences
- ✅ Verify migration completed successfully

### Step 6: Start Pulsarr

Once migration is complete, start Pulsarr normally:

```bash
docker-compose up -d
```

Pulsarr will now use your PostgreSQL database!

## Environment Variables Reference

### Database Type
- `dbType` - Set to `postgres` for PostgreSQL

### Individual Connection Parameters
- `dbHost` - PostgreSQL server hostname (default: `localhost`)
- `dbPort` - PostgreSQL server port (default: `5432`)
- `dbName` - Database name (default: `pulsarr`)
- `dbUser` - Database username (default: `postgres`)
- `dbPassword` - Database password (default: `pulsarrpostgrespw`)

### Connection String
- `dbConnectionString` - Full PostgreSQL connection string (optional)

## Migration Options

The migration script supports several options:

```bash
# Verbose output (shows detailed progress)
docker-compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data npm run migrate:sqlite-to-postgres -- --verbose

# Custom batch size (default: 1000)
docker-compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data npm run migrate:sqlite-to-postgres -- --batch-size=500

# Show help
docker-compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data npm run migrate:sqlite-to-postgres -- --help
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
- Ensure the database user has CREATE, INSERT, UPDATE, DELETE permissions
- For initial setup, the user may need additional privileges to create tables

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