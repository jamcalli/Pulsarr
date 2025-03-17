<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/src/client/assets/images/pulsarr.svg" alt="Pulsarr Logo" width="150"/>
  <h1>Pulsarr</h1>
  <p>Real-time Plex watchlist monitoring, routing, and notification center</p>
  
  ![Version](https://img.shields.io/github/v/release/jamcalli/pulsarr?include_prereleases&style=flat-square)
  ![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
  ![Node](https://img.shields.io/badge/node-23.6.0-green?style=flat-square)
  ![Status](https://img.shields.io/badge/status-beta-orange?style=flat-square)
</div>

Enjoy all the benefits of other content discovery systems without requiring users to use additional services.

Pulsarr is an integration tool that bridges Plex watchlists with Sonarr and Radarr, enabling real-time media monitoring and automated content acquisition all from within the Plex App itself.

It provides user-based watchlist synchronization for yourself and for friends, smart content routing based on genre, and notification capabilities (Discord and Email).

(see the [Quick Start Guide](#quick-start) below to get going)

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/src/client/assets/screenshots/Login.png" alt="Login"/>

## Features

- **Real-time Watchlist Monitoring**: Monitors Plex watchlists (yours and friends') through RSS feeds to trigger automatic downloads via Sonarr and Radarr.
- **Multi-instance Support**: Route content to different Sonarr/Radarr instances based on your needs.
- **Genre-based Routing**: Send different genres to specific root folders, quality profiles, or completely separate instances.
- **Instance Synchronization**: Keep multiple instances in sync (e.g., send content to both Sonarr4K and SonarrHD) while respecting genre rules. Works with both existing and newly added instances. Includes a sync feature for newly added instances.
- **Discord Integration**: User-friendly notification system with customizable settings via Discord bot commands. Allows users to customize their own notification settings.
- **Granular User Controls**: Choose which users can sync content from their watchlists.
- **Automatic Configuration**: Self-configures webhook endpoints in Sonarr/Radarr to route notifications as soon as your content is ready.
- **Smart Notification System**: Prevents notification spam with intelligent batching for season packs and individual episodes / movies.
- **Comprehensive Web UI**: Modern interface with detailed statistics and admin settings.
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

1. **RSS Detection**: Continuously monitors Plex RSS feeds for new watchlist items
2. **User Permissions**: Verifies if the user has sync permissions enabled
3. **Genre Routing**: Analyzes content genres and routes to appropriate instances based on your configured genre rules
4. **Default Instance**: Items not matching genre rules are sent to your default Sonarr/Radarr instance
5. **Instance Synchronization**: Automatically copies content to any synced instances while respecting genre routes
6. **Grab Notification**: Sends configurable notifications when content is available for viewing

### Notification Flow
The notification system is designed to be informative:

1. **Webhook Reception**: Receives webhooks from Sonarr/Radarr when content is imported
2. **Smart Queuing**: Groups multiple episodes from the same season to prevent notification spam (when importing non-season packs)
3. **Batch Processing**: Intelligently batches season packs into single notifications
4. **User Targeting**: Identifies users who have the show in their watchlist and have enabled notifications
5. **Multi-channel Delivery**: Sends personalized notifications via Discord DMs, Email (coming soon), and can send global grabs via webhooks
6. **Customizable Preferences**: Each user can configure their notification preferences via Discord, or the admin can via the UI

## Quick Start

### Prerequisites
- Docker (recommended for deployment)
- Plex Pass subscription (non Plex Pass coming soon)
- Sonarr/Radarr installation(s)

### Docker Installation (Recommended)
1. Create a `.env` file with your configuration (see [Configuration](#configuration) below)

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
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - NODE_ARGS=--log-both
```
The logger defaults to file logging. This can be changed by modifying the NODE_ARGS in the docker compose. Accepted values are log-terminal, log-both, or log-file respectively. 

3. docker compose up -d

4. Navigate to the web UI (localhost:3003) to complete setup.

### Manual Installation

### Prerequisites

- Node.js 23.6.0 or higher (for local build)

```bash
# Clone the repository
git clone https://github.com/jamcalli/Pulsarr.git
cd pulsarr

# Install dependencies
npm install

# Build the server
npm run build

# Run Migrations
npm run migrate

# Start the server
npm run start:prod
```

## Configuration

Pulsarr should be configured via the web ui, however, it can also be configured by .env variables. Any value passed through the .env will supersede any values within the db config. 

### Core Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `port` | Backendport | `3003` |
| `baseUrl` | Base Url (NEEDS TO BE THE ADDRESS THAT PULSARR CAN BE REACHED BY BOTH SONARR/RADARR) | `http://localhost` |
| `LogLevel` | Logging level | `info` |
| `CookieSecured` | Serve Cookie only via https (can omit unless setting to true) | `false` |

Here is how your .env should look:

```
baseUrl=http://localhost    
port=3003                                                 
cookieSecured=false                    
logLevel=info                         
```

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
logLevel=info                          # Logging level (defaults to silent. Recommended info)
closeGraceDelay=10000                  # Shutdown grace period in ms
rateLimitMax=100                       # Max requests per time window 
syncIntervalSeconds=10                 # Sync interval in seconds
queueProcessDelaySeconds=60            # Queue processing delay in seconds

# Discord Configuration
discordWebhookUrl=https://discord.com/api/webhooks/xxxx/xxxx  # Webhook URL
discordBotToken=xxxx.xxxx.xxxx                                # Bot token
discordClientId=xxxxxxxxxxxx                                  # Client ID
discordGuildId=xxxxxxxxxxxx                                   # Server ID

# General Notifications
queueWaitTime=120000                   # Queue wait time in ms
newEpisodeThreshold=172800000          # New episode threshold in ms (48h)
upgradeBufferTime=2000                 # Buffer time between upgrades in ms

# Sonarr Configuration
sonarrBaseUrl=http://x.x.x.x:8989      # Sonarr instance URL
sonarrApiKey=xxxxxxxxxxxxxxxxxxxxxxxx  # Sonarr API key
sonarrQualityProfile=                  # Quality profile name (empty = default. Also accepts name or number)
sonarrRootFolder=                      # Root folder path (empty = default. Or accepts string of the path url)
sonarrLanguageProfileId=1              # Language profile ID
sonarrBypassIgnored=false              # Bypass ignored setting
sonarrSeasonMonitoring=all             # Season monitoring strategy
sonarrTags=[]                          # Tags as JSON array

# Radarr Configuration
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

# Delete Configuration
deleteMovie=false                      # Auto-delete movies setting
deleteEndedShow=false                  # Auto-delete ended shows setting
deleteContinuingShow=false             # Auto-delete continuing shows setting
deleteIntervalDays=7                   # Days to wait before deletion
deleteFiles=true                       # Delete files from disk setting
```

## Usage

1. Access the web interface at `http://your-server:3003`
2. You will be prompted to create an Admin account. Only a single admin account can be created.
3. Configure your Plex, Sonarr, and Radarr connections
4. Set up Discord notifications (optional)
5. Start the watchlist workflow
6. Add content to your Plex watchlist and watch the magic happen!

## Discord Commands

Pulsarr includes a Discord bot that allows users to manage their notification preferences:

- `/notifications` - Configure notification settings

## Screenshots

![Dashboard](https://example.com/pulsarr-dashboard.png)
![Configuration](https://example.com/pulsarr-config.png)
![Statistics](https://example.com/pulsarr-stats.png)

## API Documentation

Pulsarr includes built-in API documentation accessible at `/api/docs` when running the server.

## Roadmap

- Email notifications
- Mobile push notifications
- Enhanced user management
- Additional stats and visualization options
- Support for additional media managers

## License

Pulsarr is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

## Contributors

- [Your Name](https://github.com/yourusername)

## Acknowledgements

- [Plex](https://www.plex.tv/)
- [Sonarr](https://sonarr.tv/)
- [Radarr](https://radarr.video/)
- [Fastify](https://www.fastify.io/)
- [Discord.js](https://discord.js.org/)

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/yourusername/pulsarr/issues) on GitHub.