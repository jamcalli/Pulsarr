---
sidebar_position: 3
---

# Migrating from SQLite to PostgreSQL

Migrate your existing Pulsarr SQLite database to PostgreSQL.

## Prerequisites

- Existing Pulsarr installation on SQLite
- PostgreSQL server running and accessible
- Empty PostgreSQL database created (migration creates tables, not the database)
- Database user with ALL PRIVILEGES

:::warning Create Database First
```sql
CREATE DATABASE pulsarr;
GRANT ALL PRIVILEGES ON DATABASE pulsarr TO your_username;
```
:::

## Migration Steps

### 1. Create Migration Compose File

Create `docker-compose.migration.yml`:

```yaml
services:
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
    command: bun run migrate

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
    command: bun run migrate:postgres-setup

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
    command: bun run migrate:sqlite-to-postgres
```

### 2. Update SQLite Schema

```bash
docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-sqlite
```

### 3. Configure PostgreSQL in .env

```env
dbType=postgres
dbHost=your-postgres-host
dbPort=5432
dbName=pulsarr
dbUser=postgres
dbPassword=your-secure-password

# Or use connection string (takes priority):
# dbConnectionString=postgresql://user:pass@host:port/database
```

### 4. Setup PostgreSQL Schema

```bash
docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-postgres-setup
```

### 5. Migrate Data

```bash
# Interactive (prompts for confirmation)
docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data

# Non-interactive (auto-confirm)
echo "y" | docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data
```

The script will:
- Verify both database connections
- Create SQLite backup in `./data/backups/`
- Migrate all data with type conversions
- Update PostgreSQL sequences
- Verify row counts match

### 6. Start Pulsarr

```bash
docker compose up -d
docker compose logs pulsarr  # Verify startup
```

## Migration Options

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed progress per batch |
| `--batch-size=N` | Rows per batch (default: 1000) |
| `--help` | Show all options |

```bash
echo "y" | docker compose -f docker-compose.migration.yml --profile migration run --rm pulsarr-migrate-data bun run --bun migrations/scripts/sqlite-to-postgresql.ts --verbose
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| **Connection failed** | Verify PostgreSQL is running, check `.env` settings, test with psql client |
| **Permission denied** | Ensure user has ALL PRIVILEGES on the database |
| **Table doesn't exist** | Run step 4 (schema setup) before data migration |
| **Invalid input syntax** | Check logs for specific data causing issues |

## Rollback

1. Stop Pulsarr
2. Update `.env`:
   ```env
   dbType=sqlite
   dbPath=./data/db/pulsarr.db
   ```
3. Restore from `./data/backups/` if needed
4. Start Pulsarr
