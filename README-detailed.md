<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/icons/pulsarr.svg" alt="Pulsarr Logo" width="150"/>
  <h1>Pulsarr</h1>
  <p>Real-time Plex watchlist monitoring, routing, and notification center</p>

  ![Version](https://img.shields.io/github/v/release/jamcalli/pulsarr?style=flat-square)
  ![License](https://img.shields.io/badge/license-GPL-blue?style=flat-square)
  ![Node](https://img.shields.io/badge/node-22%20LTS-green?style=flat-square)
  ![Status](https://img.shields.io/badge/status-early--release-orange?style=flat-square)
  ![Docker Pulls](https://img.shields.io/docker/pulls/lakker/pulsarr?style=flat-square)
  ![Docker Image Size](https://img.shields.io/docker/image-size/lakker/pulsarr?style=flat-square)
  ![GitHub Stars](https://img.shields.io/github/stars/jamcalli/pulsarr?style=flat-square)
</div>

Pulsarr is an integration tool that bridges Plex watchlists with Sonarr and Radarr, enabling real-time media monitoring and automated content acquisition all from within the Plex App itself.

Enjoy all the benefits of other content discovery systems without requiring users to use additional services. All the magic happens from the primary user's Plex Token.

It provides user-based watchlist synchronization for yourself and for friends, intelligent content routing based on multiple criteria, and notification capabilities (Discord and Apprise).

Want to contribute? Check out our [Contributing Guidelines](#contributing).

(see the [Quick Start Guide](#quick-start) below to get going)

<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard1.png" alt="Dashboard" width="80%"/>
  <p><i>Additional <a href="#screenshots">screenshots</a> below</i></p>
</div>

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Notification Setup](#notification-setup)
- [Configuration](#configuration)
- [Usage](#usage)
- [Screenshots](#screenshots)
- [API Documentation](#api-documentation)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## Features

- **Real-time & Interval-based Watchlist Monitoring**:
  - Real-time monitoring through RSS feeds for Plex Pass users
  - 20-minute interval polling for non-Plex Pass users
  - All other features remain identical regardless of Plex Pass status
- **Advanced Content Routing**:
  - Intelligent routing system with support for complex conditions and multiple instances
  - Route content based on genre, user, language, year, and certification
  - See [Advanced Content Routing](#advanced-content-routing) section for details
- **Discord Integration**: User-friendly notification system with customizable settings via Discord bot commands. Allows users to customize their own notification settings.
- **Apprise Integration**: Apprise can be used to route notifications. Apprise supports many different notifications methods including email, SMS, Slack, Telegram, and many more. Users can configure their own Apprise settings via the Discord bot, or admins can set these up via the UI. System notifications can also be sent through Apprise. Please see [Apprise Documentation](#apprise-notifications) below on setting up Pulsarr with Apprise.
- **Granular User Controls**: Choose which users can sync content from their watchlists.
- **Automatic Configuration**: Self-configures webhook endpoints in Sonarr/Radarr to route notifications as soon as your content is ready.
- **Smart Notification System**: Prevents notification spam with intelligent batching for season packs and individual episodes / movies.
- **Comprehensive Web UI**: Modern interface with detailed statistics and admin settings, fully mobile friendly.
- **API Documentation**: Built-in Scalar UI for API exploration and interaction.

## Architecture

Pulsarr uses a full-stack architecture designed for reliability and performance:

### Backend
- **Fastify**: High-performance API server with plugin system
- **SQLite**: Lightweight database for storing user, watchlist, and configuration data
- **TypeScript**: Type-safe code for better reliability and maintainability

### Frontend
- **React**: Component-based UI for responsive user experience
- **Tailwind CSS**: Utility-first styling for consistent design
- **Vite**: Modern build tool for fast development and optimized production

### Integration Points
- **Plex API**: Monitors watchlist changes through RSS feeds, token syncs, and graphql calls
- **Sonarr/Radarr APIs**: Manages content acquisition across multiple instances
- **Discord API**: Delivers notifications through custom bot and webhooks

## How It Works

### Content Routing
Pulsarr uses an intelligent workflow to process and route content:

1. **Content Detection**:
   - Plex Pass: Real-time monitoring via RSS feeds
   - Non-Plex Pass: Regular polling every 20 minutes
2. **User Permissions**: Verifies if the user has sync permissions enabled
3. **Content Analysis**:
   - Evaluates content metadata (genres, language, etc.)
   - Applies configured routing rules
   - Determines optimal target instance
4. **Instance Management**: Routes content to appropriate instances based on rules
5. **Notification System**: Sends configurable notifications when content is available

### Notification Flow
The notification system is designed to be informative:

1. **Webhook Reception**: Receives webhooks from Sonarr/Radarr when content is imported
2. **Smart Queuing**: Groups multiple episodes from the same season to prevent notification spam (when importing non-season packs)
3. **Batch Processing**: Intelligently batches season packs into single notifications
4. **User Targeting**: Identifies users who have the show in their watchlist and have enabled notifications
5. **Multi-channel Delivery**: Sends personalized notifications via Discord DMs, Apprise, and can send global grabs via webhooks and Apprise system notification endpoints
6. **Customizable Preferences**: Each user can configure their notification preferences via Discord, or the admin can via the UI

## Advanced Content Routing

**Important Migration Note**: If you're upgrading from a version prior to 0.2.15, you may need to delete and recreate your content routes if you experience routing issues.

Pulsarr offers a powerful predicate-based routing system that intelligently directs content to the appropriate Sonarr/Radarr instances.

<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Content-Route-1.png" alt="Content Router UI 1" width="80%"/>
</div>

<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Content-Route-2.png" alt="Content Router UI 2" width="80%"/>
</div>

### Key Features

- **Conditional Logic**: Build complex routing rules with AND/OR logic and nested condition groups
- **Multiple Criteria Types**: Route content based on:
  - Genre (e.g., Anime → dedicated instance)
  - User (e.g., specific users' content → specific profiles/folders)
  - Language (e.g., Spanish content → spanish content folder)
  - Year (e.g., pre-2000 movies → classics folder in another instance)
  - Certification (e.g., R-rated → separate folder)
  - Season (e.g., shows with more than 5 seasons → lower quality profile -> add only first season)
- **Visual Rule Builder**: Intuitive interface for creating and managing routing rules
- **Priority-based Processing**: Assign weights to rules to control which takes precedence (used when multiple rules send content to the same instance)
- **Multi-Instance Routing**: Content can be simultaneously sent to multiple instances when different rules match, allowing for content to exist in multiple instances

**Example**: "Route Japanese Anime requested by specific users to the Anime instance with high-quality profile, while sending all other anime content to the default instance."

The routing system processes all matching rules that target different instances, allowing the same content to appear in multiple libraries as needed. When multiple rules target the same instance, only the highest priority rule is applied for that specific instance.


## Quick Start

### Prerequisites
- Docker (recommended for deployment)
- Plex Pass subscription (non-Plex Pass users supported with 20-minute polling intervals)
- Sonarr/Radarr installation(s)

### Installation Options

#### Docker Installation (Recommended)
1. Create a `.env` file with your configuration (see [Configuration](#configuration) below)

2. Create a docker-compose.yml and copy the contents below:

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

4. Navigate to the web UI (localhost:3003) to complete setup.

#### Unraid Installation

Pulsarr is available in the Unraid Community Applications (CA) store. You can install it directly from the Apps tab in Unraid:

1. Open the Unraid web UI
2. Navigate to the "Apps" tab
3. Search for "Pulsarr"
4. Click "Install"

Alternatively, you can use the Docker Installation method described above.

#### Manual Installation

**Prerequisites**
- Node.js 22 LTS or higher (for local build)

```bash
# Clone the repository
git clone https://github.com/jamcalli/Pulsarr.git

cd Pulsarr

# Install dependencies
npm install

# Build the server
npm run build

# Run Migrations
npm run migrate

# Start the server
npm run start:prod
```

**Important**: When building from source, you **must** provide your own TMDB API Read Access Token for metadata features. 

1. Create a TMDB account at [themoviedb.org](https://www.themoviedb.org/)
2. Get your API Read Access Token at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
3. Add to your `.env` file: `tmdbApiKey=your_read_access_token_here`

For more details, see the environment variables documentation.

### Initial Setup

1. Access the web interface at `http://your-server:3003`
2. You will be prompted to create an Admin account. Only a single admin account can be created.
3. Upon first login, you should be directed to enter your [Plex Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/). Enter it to begin the sync. This is the only expensive operation in the entire workflow. The Plex API can rate limit this request. If you start seeing warnings in the logs, wait a minute and try again by clicking the `Manual Refresh` button. Don't worry, it will never have to run this again as all metadata is cached in the database.
4. Configure your Sonarr and Radarr connections on their respective pages:
   - Add instance details (URL, API key)
   - Configure default quality profiles and root folders
   - Set up content routing rules (optional). *Note: Multiple routing rules with complex conditions can be configured. Create as many as you'd like to handle different content types, users, languages, etc.*
5. After configuring both Sonarr and Radarr, ensure that you set all the sync permissions for any friends' watchlists you'd like to include. Head to the `Plex` page where you'll find the user table at the bottom. Click the three dots on the right to modify any of the values. **IMPORTANT**: All users who would like to have their watchlists synced need to ensure that their [Account Visibility](https://app.plex.tv/desktop/#!/settings/account) is set to 'Friends Only' or 'Friends of Friends'. Also, disabling any user's sync will result in a delay (approximately 1 minute) before processing.
6. Once you are satisfied, head to the `Dashboard` page and click on the Start button next to the Main Workflow heading. Be sure to toggle 'Auto Start' to true.

## Notification Setup

### Discord Notifications

The webhook endpoint can be used without creating a Discord bot. Point this webhook at an admin-only channel to view notifications about who added what. You will receive webhooks like this:

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Webhook-grab.png" width="400" alt="Webhook Grab">

You can configure multiple Discord webhook URLs by separating them with commas. This allows you to send notifications to multiple channels or servers simultaneously. For example:
```
https://discord.com/api/webhooks/id1/token1,https://discord.com/api/webhooks/id2/token2
```

1. Create a Discord Bot
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name (e.g., "Pulsarr")
   - Provide an icon too. Here is one you can use:

     <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/icons/pulsarr-lg.png" width="250" alt="Pulsarr Logo">

   - Go to the "Bot" section and click "Add Bot"
   - Under "Privileged Gateway Intents", enable "Message Content Intent"
   - Save your changes
   - Click "Reset Token" and copy the new token - you'll need this for your Pulsarr configuration

2. Configure Bot Permissions
   - Go to OAuth2 > URL Generator
   - Under "Scopes", select "bot" and "applications.commands"
   - Under "Bot Permissions", select at minimum:
     - Send Messages
     - Embed Links
     - Use Slash Commands
     - Send Messages in Threads
     - Use External Emojis
   - Copy the generated URL

3. Invite the Bot to Your Server
   - Paste the URL you copied into a browser
   - Select your Discord server from the dropdown
   - Authorize the permissions

4. Configure Pulsarr Discord Bot
   - In your Pulsarr configuration, add:
     - Bot Token (from step 1)
     - Client ID (found in the "General Information" tab of your Discord application)
     - Guild ID (your Discord server ID - enable Developer Mode in Discord settings, then right-click your server and "Copy ID")

5. Start Discord Bot
   - After providing all the required fields, click the 'Start' button next to the Discord Bot Settings header.
   - Users can then use the `/notifications` command within your server. They will be prompted to enter their Plex username to create the association with their watchlist.

   <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Discord-Signup.png" width="400" alt="Discord Signup">

   Users can now configure their own notification preferences. These can be accessed anytime by using the `/notifications` command.

   <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Discord-Settings.png" width="400" alt="Discord Settings">

   <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Discord-Edit-Modal.png" width="400" alt="Discord Edit Modal">

**NOTE**: The system now uses your actual Plex username for the primary token user. When setting notification preferences, use your Plex username.

When your content is available, you will receive DMs like these:

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/DM-New-Epp.png" width="400" alt="DM New Episode">

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/DM-Season.png" width="400" alt="DM Season">

## Apprise Notifications

Pulsarr supports integration with [Apprise](https://github.com/caronc/apprise) for enhanced notification capabilities. Apprise allows you to send notifications to a wide variety of supported services like Telegram, Slack, Discord, email services, SMS gateways, and many more from a single unified interface.

### Benefits of Using Apprise

- **Multiple notification channels**: Send notifications to multiple platforms simultaneously
- **Flexible configuration**: Easy setup through URL-based notification channels
- **Extensive service support**: Works with 80+ notification services
- **Customizable messaging**: Send rich notifications with formatting options
- **Centralized notification management**: Configure and manage all your notification targets in one place

### Installation Options

#### Option 1: Combined Docker Compose (Recommended)

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

#### Option 2: Separate Docker Compose Files

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

### Using Apprise with Pulsarr

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

### Configuring Notification Methods

Users can configure their own Apprise notification methods in two ways:

1. **Via Discord Bot**:
   - Users can use the `/notifications` command in Discord
   - This allows them to select Apprise as their notification method
   - Users will be notified about content availability automatically

2. **Via Admin Panel**:
   - The admin user can configure Apprise notifications
   - Navigate to the Notifications section in the Pulsarr admin panel
   - Set the default notification method to Apprise for the system

### Notification Types Supported

With Apprise integration enabled, Pulsarr will automatically send content availability notifications when:
- New episodes of TV shows are available
- New movies are available
- Season packs are available

All notifications are handled seamlessly through the Apprise integration without requiring additional configuration.

### Troubleshooting

The integration is designed to work automatically, but if you encounter issues:

- **Connection Issues**: If using separate Docker Compose files, ensure the Apprise URL is correctly set in your `.env` file
- **Cannot reach Apprise**: When using the combined Docker Compose, the service discovery is automatic. If using separate setups, verify the correct IP address is being used
- **Service Not Starting**: Make sure both containers have started successfully with `docker compose ps`

For more information about Apprise itself, refer to the [official Apprise documentation](https://github.com/caronc/apprise/wiki).

## Configuration

Pulsarr uses a hybrid configuration approach. Core application settings (like port, URL, logging) must be defined in a `.env` file, while application-specific settings are configured through the web UI after installation. 

The `.env` file is required for the initial setup and contains essential configuration values. Any values set in the `.env` file will override settings stored in the database, giving you flexibility to customize your deployment.

**Note about Apprise**: If you're using the Apprise integration, additional configuration values like `appriseUrl` should be included in your `.env` file. These values are only needed if you're running the Apprise container alongside Pulsarr.

### Core Configuration

| Variable | Description | Required? | Default |
|----------|-------------|-----------|---------|
| `baseUrl` | Base URL where Pulsarr can be reached by Sonarr/Radarr (e.g., `http://pulsarr` for Docker network or `http://your-server-ip`) | Yes | `http://localhost` |
| `port` | Port where Pulsarr is accessible - works with baseUrl to form complete address | Yes | `3003` |
| `TZ` | Your local timezone (e.g., America/New_York, Europe/London) | Yes | `UTC` |
| `logLevel` | Logging level (silent, error, warn, info, debug, trace) | Recommended | `silent` |
| `enableConsoleOutput` | Show logs in terminal (default: true) | No | `true` |
| `enableRequestLogging` | Enable HTTP request logging (default: true) | No | `true` |
| `cookieSecured` | Set to true ONLY if serving UI over HTTPS | No | `false` |
| `appriseUrl` | URL for the Apprise server (only if using Apprise) | No* | None |

*Required only if you're using the Apprise integration.

Here is how your .env should look:

```env
# Required settings
baseUrl=http://your-server-ip   # Address where Pulsarr can be reached by Sonarr/Radarr
port=3003                       # Port where Pulsarr is accessible
TZ=America/Los_Angeles          # Set to your local timezone

# Recommended settings
logLevel=info                   # Default is 'silent', but 'info' is recommended
enableConsoleOutput=true        # Show logs in terminal (default: true)
enableRequestLogging=true       # Enable HTTP request logging (default: true)

# Optional settings
cookieSecured=false             # Set to 'true' ONLY if serving UI over HTTPS

# Only needed if using Apprise
# appriseUrl=http://apprise:8000  # URL to your Apprise container
```

**Logging Configuration**: Pulsarr now uses environment variables for logging control:
- `enableConsoleOutput=true` - Show logs in terminal (default: true)
- `enableRequestLogging=true` - Enable HTTP request logging (default: true)  
- Files are always logged to `./data/logs/` directory

### Authentication Configuration

Pulsarr supports configurable authentication options:

Set the environment variable `authenticationMethod` in your `.env` file to one of these values:

- `required` - Authentication is always required (default)
- `requiredExceptLocal` - Authentication is required except for local addresses
- `disabled` - Authentication is completely disabled

When using `requiredExceptLocal`, connections from the following private IP ranges will bypass authentication:
- 127.0.0.0/8 (localhost)
- 10.0.0.0/8 (private network)
- 172.16.0.0/12 (private network)
- 192.168.0.0/16 (private network)
- 169.254.0.0/16 (link-local)
- ::1/128 (IPv6 localhost)
- fc00::/7 (IPv6 unique local addresses)
- fe80::/10 (IPv6 link-local addresses)
- ::ffff:x.x.x.x (IPv4-mapped IPv6 addresses)

**Note**: After changing this setting in your `.env` file, you need to restart the container for it to take effect.

### Dev / Other Configurations

## Example Development Environment

Below is an example of a complete development environment configuration:

```
# Server Configuration
baseUrl=http://x.x.x.x                 # Local network address
port=3003                              # Application port
dbPath=./data/db/pulsarr.db            # SQLite database location
cookieSecret=xxxxxxxxxxxxxxxxxxxxxxxx  # Secret key for cookies (randomly generated by default)
cookieName=pulsarr                     # Name of the cookie
cookieSecured=false                    # Set to true for HTTPS only
logLevel=info                          # Logging level (defaults to silent. Recommended: info)
authenticationMethod=required          # Authentication method (required, requiredExceptLocal, disabled)
closeGraceDelay=10000                  # Shutdown grace period in ms
rateLimitMax=100                       # Max requests per time window
syncIntervalSeconds=10                 # Sync interval in seconds
queueProcessDelaySeconds=60            # Queue processing delay in seconds

# Discord Configuration
discordWebhookUrl=https://discord.com/api/webhooks/xxxx/xxxx  # Webhook URL(s), separate multiple with commas
discordBotToken=xxxx.xxxx.xxxx                                # Bot token
discordClientId=xxxxxxxxxxxx                                  # Client ID
discordGuildId=xxxxxxxxxxxx                                   # Server ID

# Apprise Configuration
appriseUrl=http://x.x.x.x:8000         # URL for the Apprise server (e.g., http://apprise:8000 for Docker networking)
enableApprise=true                     # This is auto set by Pulsarr based on the availability of the Apprise server
systemAppriseUrl=                      # Apprise URL for system notifications only

# General Notifications
queueWaitTime=120000                   # Queue wait time in ms
newEpisodeThreshold=172800000          # New episode threshold in ms (48h)
upgradeBufferTime=2000                 # Buffer time between upgrades in ms

# Sonarr Configuration (these will seed a single instance. Needs all the values. Only use in dev.)
sonarrBaseUrl=http://x.x.x.x:8989      # Sonarr instance URL
sonarrApiKey=xxxxxxxxxxxxxxxxxxxxxxxx  # Sonarr API key
sonarrQualityProfile=                  # Quality profile name (empty = default. Also accepts name or number)
sonarrRootFolder=                      # Root folder path (empty = default. Or accepts string of the path url)
sonarrLanguageProfileId=1              # Language profile ID
sonarrBypassIgnored=false              # Bypass ignored setting
sonarrSeasonMonitoring=all             # Season monitoring strategy
sonarrMonitorNewItems=all              # Monitor strategy for new items ('all' or 'none')
sonarrTags=[]                          # Tags as JSON array
sonarrSeriesType=standard              # Series type: 'standard', 'anime', or 'daily'

# Radarr Configuration (these will seed a single instance. Needs all the values. Only use in dev.)
radarrBaseUrl=http://x.x.x.x:7878      # Radarr instance URL
radarrApiKey=xxxxxxxxxxxxxxxxxxxxxxxx  # Radarr API key
radarrQualityProfile=                  # Quality profile name (empty = default. Also accepts name or number)
radarrRootFolder=                      # Root folder path (empty = default. Or accepts string of the path url)
radarrLanguageProfileId=1              # Language profile ID
radarrBypassIgnored=false              # Bypass ignored setting
radarrTags=[]                          # Tags as JSON array

# Plex Configuration
plexTokens=["xxxxxxxxxxxxxxxxxxxx"]    # Plex authentication token
skipFriendSync=false                   # Skip syncing Plex friends
enablePlexPlaylistProtection=false     # Enable playlist protection feature
plexProtectionPlaylistName="Do Not Delete"  # Name of protection playlist
plexServerUrl=http://localhost:32400   # Plex server URL (optional, can be auto-detected)

# User Tagging Configuration
tagUsersInSonarr=false                 # Enable automatic user tagging in Sonarr
tagUsersInRadarr=false                 # Enable automatic user tagging in Radarr
tagPrefix=pulsarr:user                 # Prefix for user tags - required alphanumeric, dash, underscore, colon, period only
persistHistoricalTags=true             # DEPRECATED: Use removedTagMode instead (keeps for backward compatibility)
cleanupOrphanedTags=true               # When true, removes tags for deleted users during sync
removedTagMode=remove                  # How to handle tags when content is removed: 'keep', 'remove', or 'prefix'
removedTagPrefix=pulsarr:removed       # Prefix for removal tags when using 'prefix' mode
deletionMode=watchlist                 # Deletion workflow mode: 'watchlist' or 'tag-based'

# Delete Configuration
deleteMovie=false                      # Auto-delete movies setting
deleteEndedShow=false                  # Auto-delete ended shows setting
deleteContinuingShow=false             # Auto-delete continuing shows setting
deleteFiles=true                       # Delete files from disk setting
deleteSyncNotify=none                  # Notify of delete sync status: 'none' | 'message' | 'webhook' | 'both'
maxDeletionPrevention=10               # Safeguard to prevent mass deletion. % of total library to allow during delete sync
```

## Usage

1. Please read through the documentation and follow the [Quick Start Guide](#quick-start).
2. Access the web interface at `http://your-server:3003`
3. You will be prompted to create an Admin account. Only a single admin account can be created.
4. Configure your Plex, Sonarr, and Radarr connections
5. Set up Discord notifications (optional)
6. Start the watchlist workflow
7. Add content to your Plex watchlist and watch the magic happen!

## Discord Commands

Pulsarr includes a Discord bot that allows users to manage their notification preferences:

- `/notifications` - Configure notification settings

## Delete Sync

Delete Sync automatically removes content from your Sonarr/Radarr instances when it's no longer present on any user's watchlist. This completes the content lifecycle management, ensuring your libraries remain clean and optimized.

### Key Features

- **Advanced Deletion Modes**:
  - **Watchlist-based**: Removes content not present on any user's watchlist (traditional mode)
  - **Tag-based**: Uses removal tags to mark content for deletion with flexible behavior options
- **Plex Playlist Protection**: Protect content from deletion using special playlists
- **File Management**: Option to delete or retain actual media files when removing content
- **Safety Mechanisms**: Built-in protections against accidental mass deletion
- **Scheduling**: Configurable timing for automatic cleanup operations
- **Dry Run Mode**: Preview what would be deleted before committing changes

### Deletion Modes

#### Watchlist-Based Deletion (Traditional)
Removes content when it's no longer present on any synced user's watchlist. This is the original deletion method that ensures your library only contains actively watched content.

#### Tag-Based Deletion
Works with the user tagging system to provide more granular control:
- Automatically adds removal tags when content is removed from watchlists
- Configurable tag behavior:
  - **Keep tags**: Maintain existing tags for historical tracking
  - **Remove tags**: Clean up all tags upon removal
  - **Add prefix**: Add "removed:" prefix to existing tags
- Allows for delayed deletion based on tag presence

### Plex Playlist Protection

Protect specific content from deletion by adding it to designated Plex playlists:

- **Automatic Playlist Creation**: Protection playlists are automatically created for all users on your Plex server
- **"Do Not Delete" Playlists**: Content in these playlists is automatically excluded from deletion
- **Simple Protection**: Just add any items to the protection playlist, and they'll be excluded from the deletion process
- **Multi-User Support**: Syncs protection playlists across all enabled users
- **Customizable Names**: Configure your own playlist name (default: "Do Not Delete")
- **Works with Both Modes**: Compatible with watchlist and tag-based deletion methods

### Configuration

Navigate to the Utilities page in the Pulsarr web interface and configure your deletion preferences:

- **Mode Selection**: Choose between watchlist-based or tag-based deletion
- **Content Types**: Select which content to delete (movies, ended shows, continuing shows)
- **File Management**: Choose whether to delete associated files from disk
- **Tag Behavior**: Configure how removal tags are handled
- **Playlist Protection**: Set up protected playlist names
- **User Sync Settings**: Control which users' watchlists/playlists affect deletion
- **Notifications**: Configure deletion event notifications
- **Safety Threshold**: Set maximum deletion prevention percentage
- **Scheduling**: Configure timing for automatic cleanup operations
- **Dry Run Mode**: Preview deletions without committing changes

### Running Delete Sync

You can operate Delete Sync in several ways:

1. **Enable Automatic Sync**: Toggle the feature on to run on your configured schedule
2. **Run Now**: Manually trigger the deletion process immediately
3. **Dry Run**: Preview what would be deleted without making any changes

**Note**: When Plex Playlist Protection is enabled, running a dry run will automatically create the protection playlists for all users if they don't already exist. This is a safe operation that only creates the playlists without deleting any content.

You can configure notifications to receive information regarding your workflow:

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Delete-Sync-Dry.png" width="400" alt="Delete Sync Dry">

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Delete-Sync-Error.png" width="400" alt="Delete Sync Error">

### Safety Features

Delete Sync includes several safety measures to prevent accidental data loss:

- Mass deletion prevention based on configurable thresholds
- Selective content type targeting
- Dry run previews
- Detailed deletion logs
- **Playlist-Based Content Protection**

### Integration with User Tagging

When using tag-based deletion mode, Delete Sync works seamlessly with the User Tagging feature:

1. When content is removed from a watchlist, removal tags are automatically added
2. Content with removal tags can be:
   - Immediately deleted based on your schedule
   - Retained with historical tags for record-keeping
   - Marked with a "removed:" prefix for easy identification
3. Protected content in playlists is excluded regardless of tag status

### Recommendations

- Begin with a dry run to understand the impact on your libraries.
- Consider using playlist protection for seasonal content or favorites.
- Use tag-based mode for more granular control over deletion timing.
- Keep files for ended shows that may return for future seasons.
- Regularly review your protected playlists to ensure they're current.

## User Tagging

Pulsarr's User Tagging feature organizes your media by automatically adding user tags to content in Sonarr and Radarr, making it easy to track which users requested which content.

### Key Features

- **Automatic User Tracking**: Tags movies and shows with the usernames of people who added them to their watchlists
- **Multi-Instance Support**: Works across all your Sonarr and Radarr instances simultaneously
- **Customizable Prefix**: Configure your own prefix for user tags (default: "pulsarr:user")
- **Enhanced Tag Management**: Flexible tag removal options when content leaves watchlists
- **Tag-Based Deletion**: Option to use tags for content deletion instead of watchlist status
- **Batch Processing**: Efficiently processes large libraries with minimal performance impact

### Usage Benefits

- **Content Organization**: Easily identify who requested specific content
- **User-Based Filtering**: Create custom filters in Sonarr/Radarr based on user tags
- **Accountability**: Track which users are driving your media library growth
- **Lifecycle Management**: Use tags to manage content from request to removal
- **Management**: Quickly find all content requested by specific users
- **Integration**: Works seamlessly with Sonarr and Radarr's existing tag system

### Configuration

1. Navigate to the **Utilities** section in the Pulsarr web interface
2. Find the User Tagging section
3. Configure options including:
   - Enable/disable tagging for Sonarr and Radarr
   - Set a custom tag prefix
   - Choose whether to preserve historical tags
   - Enable/disable cleanup of orphaned tags
4. Save your changes to apply the settings
5. Click "Sync Tags Now" to immediately apply tags to all content

### Enhanced Tag Management

When content is removed from a user's watchlist, you have multiple options for handling the associated tags:

- **Keep**: Preserve tags for historical tracking even after content is removed from watchlists
- **Remove**: Delete tags when content is removed from watchlists
- **Prefix**: Add a customizable prefix (e.g., "removed:") to existing tags when content is removed from watchlists

These tag management options work seamlessly with Delete Sync's tag-based deletion mode, allowing you to:
- Identify content for deletion based on tag status rather than watchlist presence
- Maintain historical records of who requested content
- Create custom workflows based on tag lifecycle

### Advanced Settings

- **Tag Prefix**: Customize the prefix used for all user tags (default: "pulsarr:user")
- **Tag Removal Options**: Configure how tags are handled when content is removed from watchlists
- **Customizable Removal Prefix**: Define your own prefix for removed content tags
- **Tag-Based Deletion**: Enable tags to identify content for deletion instead of watchlist status
- **Preserve Historical Tags**: When enabled, keeps tags even after content is removed from a user's watchlist
- **Clean Up Orphaned Tags**: Automatically removes tags for deleted users
- **Manual Tag Removal**: Option to remove all user tags if needed

### Integration with Delete Sync

User Tagging works seamlessly with Delete Sync's tag-based deletion mode:
- Configure tags to be added, modified, or removed based on watchlist changes
- Use tag status to determine when content should be deleted
- Protect content with specific tags from deletion
- Create complex deletion workflows based on tag lifecycle

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/User-Tags.png" alt="User Tagging" width="80%"/>

## Plex Notifications

### Automatic Library Updates

Pulsarr's Plex Notifications feature automatically configures webhooks in all your connected Sonarr and Radarr instances to keep your Plex libraries fresh without manual intervention.

#### Key Features

- **Automatic Configuration**: Sets up notification webhooks in all connected Sonarr and Radarr instances
- **Server Discovery**: Easily find and select your Plex server with the built-in discovery tool
- **Content Synchronization**: Keeps your Plex libraries updated when content is added, removed, or modified
- **Multi-Instance Support**: Works across all your Sonarr and Radarr instances simultaneously
- **SSL Support**: Secure connections to your Plex server

#### Setup Instructions

1. Navigate to the **Utilities** section in the Pulsarr web interface
2. Enter your Plex authentication token (defaults to the token provided during setup)
3. Click "Find Servers" to automatically discover available Plex servers
4. Select your server or manually enter your Plex host, port, and SSL settings
5. Save your changes to automatically configure webhooks in all Sonarr and Radarr instances

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Plex-Notifications.png" alt="Plex Notifications" width="80%"/>

Once configured, anytime content is added, modified, or removed via Sonarr or Radarr, your Plex libraries will automatically refresh to reflect these changes.

## Screenshots

<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Login.png" alt="Login Screen" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard1.png" alt="Dashboard Overview" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard2.png" alt="Dashboard2" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard3.png" alt="Dashboard3" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard5.png" alt="Dashboard5" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard6.png" alt="Dashboard6" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Sonarr.png" alt="Sonarr" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Radarr.png" alt="Radarr" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Content-Route-1.png" alt="Content Router 1" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Content-Route-2.png" alt="Content Router 2" width="80%"/>
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Delete-Sync.png" alt="Delete Sync" width="80%"/>
</div>

## API Documentation

Pulsarr includes built-in API documentation accessible at `/api/docs` when running the server.

## Roadmap

- ~~Email notifications~~
- ~~Apprise for notifications~~
- ~~Non-Plex Pass (will update watchlists on 20 minute intervals. All other functionality remains)~~
- API keys
- ~~Delete Syncing~~
- Unit tests... 🤮
- Refactor documentation into a proper documentation site using Docusaurus

## Contributing

We welcome contributions to Pulsarr! This section outlines the process for contributing to the project.

### Fork and Branch Naming

1. **Fork the Repository**: Start by forking the Pulsarr repository to your GitHub account.

2. **Branch Naming Conventions**:
   - For new features: `features/your-feature-name`
   - For bug fixes: `bug-fix/brief-bug-description`
   - For documentation: `docs/what-you-are-documenting`
   - For performance improvements: `perf/what-you-are-improving`

### Development Workflow

1. **Create a Branch**: Create a new branch following the naming conventions above.

2. **Make Your Changes**: Implement your feature or fix the bug.

3. **Write Tests**: If applicable, write tests for your changes.

4. **Ensure Code Quality**:
   - Run linting tools (npm run fix to run biome)
   - Ensure tests pass (these are coming!)
   - Follow the existing code style

5. **Commit Your Changes**: Use clear, descriptive commit messages.

6. **Push to Your Fork**: Push your changes to your forked repository.

7. **Submit a Pull Request**: Create a pull request from your branch to the develop branch of the main Pulsarr repository.

### Pull Request Guidelines

When submitting a pull request, please:

1. **Describe Your Changes**: Provide a clear description of what the changes accomplish.

2. **Link Related Issues**: If your PR addresses an open issue, reference it using the GitHub issue linking syntax (e.g., "Fixes #123").

3. **Include Screenshots**: If your changes include visual elements, add screenshots to help reviewers understand the context.

4. **Update Documentation**: Ensure that documentation is updated to reflect your changes if necessary.

5. **Be Responsive**: Be prepared to address feedback and make requested changes.

### Questions?

If you have any questions about contributing, feel free to [open an issue](https://github.com/jamcalli/pulsarr/issues) with the label "question".


## License

Pulsarr is licensed under the GPL License. See the [LICENSE](LICENSE) file for more details.

## Acknowledgements

- [Plex](https://www.plex.tv/)
- [Sonarr](https://sonarr.tv/)
- [Radarr](https://radarr.video/)
- [Fastify](https://www.fastify.io/)
- [Discord.js](https://discord.js.org/)
- [Watchlistarr](https://github.com/nylonee/watchlistarr/)

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/jamcalli/pulsarr/issues) on GitHub.
