---
sidebar_position: 1
---

# Quick Start Guide

This guide will help you quickly set up Pulsarr to monitor your Plex watchlists and route content to Sonarr and Radarr.

## Prerequisites

Before you begin, ensure you have:

- Docker (recommended for deployment)
- Plex Pass subscription (optional - non-Plex Pass users supported with 5-minute staggered polling)
- Sonarr/Radarr installation(s)
- API keys for your Sonarr/Radarr instances

## Installation Options

Pulsarr can be installed using Docker (recommended), Unraid, or manual installation. Choose the method that works best for your environment.

### Docker Installation (Recommended)

1. Create a `.env` file with your configuration:

```plaintext
TZ=America/Los_Angeles          # Set to your local timezone

# Logging Configuration (optional)
logLevel=info                   # Log level (default: info)
                                # Accepts: fatal | error | warn | info | debug | trace | silent

enableConsoleOutput=true        # Console logging (default: true)
                                # Any value other than "false" enables terminal output
                                # Logs are always written to ./data/logs/ regardless of this setting

enableRequestLogging=false      # HTTP request logging (default: false)
                                # Logs HTTP method, URL, host, remote IP/port, response codes, response times
                                # Sensitive query parameters (token, apiKey, password) are automatically redacted
```

:::tip Network Configuration
The `baseUrl` and `port` settings (for Sonarr/Radarr webhook callbacks) are **automatically configured via the web UI**. When you test your Sonarr/Radarr connections, Pulsarr will detect any webhook callback errors and prompt you to configure the correct network settings for your deployment.
:::

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

### Unraid Installation

Pulsarr is available in the Unraid Community Applications (CA) store:

1. Open the Unraid web UI
2. Navigate to the "Apps" tab
3. Search for "Pulsarr"
4. Click "Install"
5. Configure the container settings as needed
6. Start the container

Alternatively, you can use the Docker installation method described above.

### Manual Installation

If you prefer to build and run Pulsarr manually:

:::warning Upgrading from Previous Versions
If you previously installed Pulsarr with Node.js, you must switch to [Bun](https://bun.sh) before updating to the latest version. Install Bun: `curl -fsSL https://bun.sh/install | bash`
:::

#### Prerequisites
- Bun 1.3 or higher — install from [bun.sh](https://bun.sh)
- Git

#### Steps

```bash
# Clone the repository
git clone https://github.com/jamcalli/pulsarr.git

cd pulsarr

# Install dependencies
bun install

# Build the application
bun run build

# Run database migrations
bun run migrate

# Start the server
bun run start:prod
```

The server will start on port 3003 by default. Navigate to `http://localhost:3003` to complete setup.

:::important TMDB API Key Required
When building from source, you **must** provide your own TMDB API Read Access Token for metadata features. See the [TMDB API Configuration](../development/environment-variables#tmdb-api-configuration) section for setup instructions.
:::

For more detailed configuration options, see:
- [Configuration Guide](configuration)
- [Environment Variables Reference](../development/environment-variables)

### Native Installation

Standalone builds with easy installers are available for Linux, macOS, and Windows — no Docker or runtime install required.

| Platform | Recommended Method |
|----------|-------------------|
| **Linux** | One-line installer: `curl -fsSL https://raw.githubusercontent.com/jamcalli/Pulsarr/main/scripts/installers/linux/install.sh \| sudo bash` |
| **Windows** | Download and run `pulsarr-vX.X.X-windows-x64-setup.exe` |
| **macOS** | Download `pulsarr-vX.X.X-macos-{arch}-app.zip`, extract, and move to Applications |

See the [Native Installation Guide](./native-installation) for detailed instructions, service management, and manual installation options.

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
- [Set up user tagging](../utilities/07-user-tagging.md)
- [Configure automatic deletion](../utilities/02-delete-sync.md)