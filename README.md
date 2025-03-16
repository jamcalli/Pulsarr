I'll create a comprehensive README.md for Pulsarr based on the provided code and your example preferences. Here's a draft that follows the style you like while highlighting all the features of your application:

# Pulsarr

Pulsarr is a powerful integration tool that bridges Plex watchlists with Sonarr and Radarr, enabling real-time media monitoring and automated content acquisition.

It provides seamless watchlist synchronization, smart content routing based on genre, and comprehensive notification capabilities across multiple platforms.

![MIT license](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-beta-orange)

## Features

- **Real-time Watchlist Monitoring**: Monitors Plex watchlists (yours and friends') through RSS feeds to trigger automatic downloads via Sonarr and Radarr.
- **Multi-instance Support**: Route content to different Sonarr/Radarr instances based on your needs.
- **Genre-based Routing**: Send different genres to specific root folders, quality profiles, or completely separate instances.
- **Instance Synchronization**: Keep multiple instances in sync (e.g., send content to both Sonarr4K and SonarrHD) while respecting genre rules. Works with both existing and newly added instances.
- **Discord Integration**: User-friendly notification system with customizable settings via Discord bot commands.
- **Granular User Controls**: Choose which users can sync content from their watchlists.
- **Automatic Configuration**: Self-configures webhook endpoints in Sonarr/Radarr.
- **Smart Notification System**: Prevents notification spam with intelligent batching for season packs.
- **Comprehensive Web UI**: Modern interface with detailed statistics and admin settings.
- **API Documentation**: Built-in Scalar UI for API exploration and interaction.

## Architecture

## How It Works

### Content Routing
Pulsarr uses an intelligent workflow to process and route content:

1. **RSS Detection**: Continuously monitors Plex RSS feeds for new watchlist items
2. **User Permissions**: Verifies if the user has sync permissions enabled
3. **Genre Routing**: Analyzes content genres and routes to appropriate instances based on your configured genre rules
4. **Default Instance**: Items not matching genre rules are sent to your default Sonarr/Radarr instance
5. **Instance Synchronization**: Automatically copies content to any synced instances while respecting genre routes
6. **Grab Notification**: Sends configurable notifications when content is successfully queued for download

### Notification Flow
The notification system is designed to be informative:

1. **Webhook Reception**: Receives webhooks from Sonarr/Radarr when content is imported
2. **Smart Queuing**: Groups multiple episodes from the same season to prevent notification spam
3. **Batch Processing**: Intelligently batches season packs into single notifications
4. **User Targeting**: Identifies users who have the show in their watchlist and have enabled notifications
5. **Multi-channel Delivery**: Sends personalized notifications via Discord DMs or webhooks
6. **Customizable Preferences**: Each user can configure their notification preferences via Discord

This system ensures content is properly routed to the right instances while keeping users informed about their media with notifications.

## Installation

### Docker Compose (Recommended)

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

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/username/pulsarr.git
cd pulsarr

# Install dependencies
npm install

# Start the server
npm run build

# Start the server
npm run start:prod
```

## Configuration

Pulsarr can be configured through environment variables or the web interface.

### Core Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `port` | Backendport | `3003` |
| `baseUrl` | Base Url (NEEDS TO BE THE ADDRESS THAT PULSARR CAN BE REACHED BY BOTH SONARR/RADARR) | `http://localhost` |
| `LogLevel` | Logging level | `info` |
| `CookieSecured` | Serve Cookie only via https (can omit unless setting to true) | `false` |

### Dev / Other Configurations

## Example Development Environment

Below is an example of a complete development environment configuration with sensitive values redacted:

```
# Server Configuration
baseUrl=http://x.x.x.x                # Local network address
port=3003                              # Application port
dbPath=./data/db/pulsarr.db            # SQLite database location
cookieSecret=xxxxxxxxxxxxxxxxxxxxxxxx  # Secret key for cookies
cookieName=pulsarr                     # Name of the cookie
cookieSecured=false                    # Set to true for HTTPS only
logLevel=info                          # Logging level
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
sonarrBaseUrl=http://x.x.x.x:8989     # Sonarr instance URL
sonarrApiKey=xxxxxxxxxxxxxxxxxxxxxxxx  # Sonarr API key
sonarrQualityProfile='Any'             # Quality profile name
sonarrRootFolder=                      # Root folder path (empty = default)
sonarrLanguageProfileId=1              # Language profile ID
sonarrBypassIgnored=false              # Bypass ignored setting
sonarrSeasonMonitoring=all             # Season monitoring strategy
sonarrTags=[]                          # Tags as JSON array

# Radarr Configuration
radarrBaseUrl=http://x.x.x.x:7878     # Radarr instance URL
radarrApiKey=xxxxxxxxxxxxxxxxxxxxxxxx  # Radarr API key
radarrQualityProfile='Any'             # Quality profile name
radarrRootFolder=                      # Root folder path (empty = default)
radarrLanguageProfileId=1              # Language profile ID
radarrBypassIgnored=false              # Bypass ignored setting
radarrTags=[]                          # Tags as JSON array

# Plex Configuration
plexTokens=["xxxxxxxxxxxxxxxxxxxx"]    # Plex authentication tokens as JSON array
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
2. Log in with the default credentials (first run will prompt you to create an admin account)
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