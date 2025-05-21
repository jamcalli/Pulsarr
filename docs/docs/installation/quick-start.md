---
sidebar_position: 1
---

# Quick Start Guide

This guide will help you quickly set up Pulsarr to monitor your Plex watchlists and route content to Sonarr and Radarr.

## Prerequisites

Before you begin, ensure you have:

- Docker (recommended for deployment)
- Plex Pass subscription (optional - non-Plex Pass users supported with 20-minute polling intervals)
- Sonarr/Radarr installation(s)
- API keys for your Sonarr/Radarr instances

## Installation Options

Pulsarr can be installed using Docker (recommended), Unraid, or manual installation. Choose the method that works best for your environment.

### Docker Installation (Recommended)

1. Create a `.env` file with your configuration:

```plaintext
# Required settings
baseUrl=http://your-server-ip   # Address where Pulsarr can be reached by Sonarr/Radarr
port=3003                       # Port where Pulsarr is accessible
TZ=America/Los_Angeles          # Set to your local timezone

# Recommended settings
logLevel=info                   # Default is 'silent', but 'info' is recommended
NODE_ARGS=--log-both            # Default logs to file only, '--log-both' shows logs in terminal too
```

2. Create a `docker-compose.yml` file and add the following:

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

3. Pull the image and run Docker Compose to start the service:

```bash
docker compose pull && docker compose up -d
```

4. Navigate to the web UI (http://your-server:3003) to complete setup.

For more detailed configuration options, see:
- [Configuration Guide](configuration)

## Initial Setup

1. Access the web interface at `http://your-server:3003`
2. Create an Admin account when prompted
3. Enter your [Plex Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) to begin synchronization
4. Configure your Sonarr and Radarr connections:
   - Add instance details (URL, API key)
   - Configure default quality profiles and root folders
   - Set up content routing rules (optional)
5. Set sync permissions for any friends' watchlists you'd like to include
   - Ensure users have their [Account Visibility](https://app.plex.tv/desktop/#!/settings/account) set to 'Friends Only' or 'Friends of Friends'
6. Head to the `Dashboard` page and click on the Start button next to the Main Workflow heading
   - Toggle 'Auto Start' to true for automatic operation

## Next Steps

After completing the quick start, you might want to:

- [Configure Discord notifications](../notifications/discord)
- [Set up Apprise integration](../notifications/apprise)
- [Configure content routing rules](../features/content-routing)
- [Set up user tagging](../utilities/user-tagging)
- [Configure automatic deletion](../utilities/delete-sync)