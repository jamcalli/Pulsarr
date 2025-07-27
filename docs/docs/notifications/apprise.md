---
sidebar_position: 2
---

# Apprise Notifications

Pulsarr supports integration with [Apprise](https://github.com/caronc/apprise) for enhanced notification capabilities. Apprise allows you to send notifications to a wide variety of supported services like Telegram, Slack, Discord, email services, SMS gateways, and many more from a single unified interface.

## Benefits of Using Apprise

- **Multiple notification channels**: Send notifications to multiple platforms simultaneously
- **Flexible configuration**: Easy setup through URL-based notification channels
- **Extensive service support**: Works with 80+ notification services
- **Customizable messaging**: Send rich notifications with formatting options
- **Centralized notification management**: Configure and manage all your notification targets in one place

## Installation Options

### Option 1: Combined Docker Compose (Recommended)

Use this combined Docker Compose file to run both Pulsarr and Apprise in the same stack:

```yaml
services:
  apprise:
    image: caronc/apprise:latest
    container_name: apprise
    ports:
      - "8000:8000"
    environment:
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
      - APPRISE_STATEFUL_MODE=simple
      - APPRISE_WORKER_COUNT=1
    volumes:
      - ./config:/config
      - ./plugin:/plugin
      - ./attach:/attach
    restart: unless-stopped

  pulsarr:
    image: lakker/pulsarr:latest
    container_name: pulsarr
    ports:
      - "3003:3003"
    volumes:
      - ./data:/app/data
      - .env:/app/.env
    restart: unless-stopped
    env_file:
      - .env
    depends_on:
      - apprise
```

This configuration ensures:
- Apprise starts before Pulsarr
- Both services run in the same Docker network
- Pulsarr can communicate with Apprise using internal Docker networking

### Option 2: Separate Docker Compose Files

If you prefer to keep them separate, you can use these two compose files:

**Apprise Compose (docker-compose.apprise.yml):**
```yaml
services:
  apprise:
    image: caronc/apprise:latest
    container_name: apprise
    ports:
      - "8000:8000"
    environment:
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
      - APPRISE_STATEFUL_MODE=simple
      - APPRISE_WORKER_COUNT=1
    volumes:
      - ./config:/config
      - ./plugin:/plugin
      - ./attach:/attach
    restart: unless-stopped
```

**Pulsarr Compose (docker-compose.yml):**
```yaml
services:
  pulsarr:
    image: lakker/pulsarr:latest
    container_name: pulsarr
    ports:
      - "3003:3003"
    volumes:
      - ./data:/app/data
      - .env:/app/.env
    restart: unless-stopped
    env_file:
      - .env
```

When using separate compose files, you'll need to add the Apprise URL to your Pulsarr `.env` file:

```sh
appriseUrl=http://host-ip-address:8000
```

Replace `host-ip-address` with your actual server IP (not localhost, as the containers won't be on the same network).

## Using Apprise with Pulsarr

The Apprise integration works out of the box with no additional configuration required in the Apprise web UI. Simply:

1. **Start the services** using the combined Docker Compose file:
   ```bash
   docker compose up -d
   ```

2. **Verify connectivity**:
   - Access the Pulsarr web interface at `http://your-server:3003`
   - Pulsarr will automatically detect and use the Apprise service
   - All notifications will be routed through Apprise seamlessly

The integration is pre-configured to work immediately with no additional setup steps required.

## Configuring Notification Methods

Users can configure their own Apprise notification methods in two ways:

1. **Via Discord Bot**:
   - Users can use the `/notifications` command in Discord
   - This allows them to select Apprise as their notification method
   - Users will be notified about content availability automatically

2. **Via Admin Panel**:
   - The admin user can configure Apprise notifications
   - Navigate to the Notifications section in the Pulsarr admin panel
   - Set the default notification method to Apprise for the system

## Notification Types Supported

With Apprise integration enabled, Pulsarr will automatically send content availability notifications when:
- New episodes of TV shows are available
- New movies are available
- Season packs are available

All notifications are handled seamlessly through the Apprise integration without requiring additional configuration.

## Troubleshooting

The integration is designed to work automatically, but if you encounter issues:

- **Connection Issues**: If using separate Docker Compose files, ensure the Apprise URL is correctly set in your `.env` file
- **Cannot reach Apprise**: When using the combined Docker Compose, the service discovery is automatic. If using separate setups, verify the correct IP address is being used
- **Service Not Starting**: Make sure both containers have started successfully with `docker compose ps`

For more information about Apprise itself, refer to the [official Apprise documentation](https://github.com/caronc/apprise/wiki).

## Advanced Features

For broadcasting content availability to shared channels independent of individual user watchlists, see [Public Content Notifications](../utilities/05-public-content-notifications.md) in the Utilities section.