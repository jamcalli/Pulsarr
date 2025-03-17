<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/icons/pulsarr.svg" alt="Pulsarr Logo" width="150"/>
  <h1>Pulsarr</h1>
  <p>Real-time Plex watchlist monitoring, routing, and notification center</p>
  
  ![Version](https://img.shields.io/github/v/release/jamcalli/pulsarr?include_prereleases&style=flat-square)
  ![License](https://img.shields.io/badge/license-GPL-blue?style=flat-square)
  ![Node](https://img.shields.io/badge/node-23.6.0-green?style=flat-square)
  ![Status](https://img.shields.io/badge/status-beta-orange?style=flat-square)
</div>

Enjoy all the benefits of other content discovery systems without requiring users to use additional services.

Pulsarr is an integration tool that bridges Plex watchlists with Sonarr and Radarr, enabling real-time media monitoring and automated content acquisition all from within the Plex App itself.

It provides user-based watchlist synchronization for yourself and for friends, smart content routing based on genre, and notification capabilities (Discord and Email).

(see the [Quick Start Guide](#quick-start) below to get going)

<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard1.png" alt="Dashboard" width="80%"/>
  <p><i>See <a href="#screenshots">more screenshots</a> below</i></p>
</div>

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
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - NODE_ARGS=--log-both
```

The logger defaults to file logging. This can be changed by modifying the NODE_ARGS in the docker compose. Accepted values are log-terminal, log-both, or log-file respectively. 

3. Run Docker Compose to start the service:
```bash
docker compose pull && docker compose up -d
```

4. Navigate to the web UI (localhost:3003) to complete setup.

#### Manual Installation

**Prerequisites**
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

### Initial Setup

1. Access the web interface at `http://your-server:3003`
2. You will be prompted to create an Admin account. Only a single admin account can be created.
3. Upon first login, you should be directed to enter your [Plex Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/). Enter it to begin the sync. This is the only expensive operation in the entire workflow. The Plex API can rate limit this request. If you start seeing warnings in the logs, wait a minute and try again by clicking the `Manual Refresh` button. Don't worry, it will never have to run this again as all metadata is cached in the database.
4. Configure your Sonarr and Radarr connections on their respective pages:
   - Add instance details (URL, API key)
   - Configure default quality profiles and root folders
   - Set up genre routing rules (optional). *Note: Multiple Genre Routes can be configured. E.g., You can have multiple 'Anime' routes, such as Anime to Instance A with root folder B, AND Anime to Instance B with root folder C, etc. Create as many as you'd like.*
5. After configuring both Sonarr and Radarr, ensure that you set all the sync permissions for any friends' watchlists you'd like to include. Head to the `Plex` page where you'll find the user table at the bottom. Click the three dots on the right to modify any of the values. **IMPORTANT**: All users who would like to have their watchlists synced need to ensure that their [Account Visibility](https://app.plex.tv/desktop/#!/settings/account) is set to 'Friends Only' or 'Friends of Friends'. Also, disabling any user's sync will result in a delay (approximately 1 minute) before processing.
6. Once you are satisfied, head to the `Dashboard` page and click on the Start button next to the Main Workflow heading. Be sure to toggle 'Auto Start' to true.

## Notification Setup

### Discord Notifications

The webhook endpoint can be used without creating a Discord bot. Point this webhook at an admin-only channel to view notifications about who added what. You will receive webhooks like this:

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Webhook-grab.png" width="30%" alt="Webhook Grab">

1. Create a Discord Bot
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name (e.g., "Pulsarr")
   - Provide an icon too. Feel free to use this one:
   
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

4. Configure Pulsarr
   - In your Pulsarr configuration, add:
     - Bot Token (from step 1)
     - Client ID (found in the "General Information" tab of your Discord application)
     - Guild ID (your Discord server ID - enable Developer Mode in Discord settings, then right-click your server and "Copy ID")

5. Start/Restart Pulsarr
   - After providing all of the required fields, click the 'Start' button next to the Discord Bot Settings header. 
   - Users can then use the `/notifications` command within your server. They will be prompted to enter their Plex username to create the association with their watchlist.

   <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Discord-Signup.png" width="40%" alt="Discord Signup">

   Users can now configure their own notification preferences. These can be accessed anytime by using the `/notifications` command. 

   <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Discord-Settings.png" width="40%" alt="Discord Settings">

   <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Discord-Edit-Modal.png" width="40%" alt="Discord Edit Modal">

**IMPORTANT**: The username for the Plex Token is ALWAYS token1. Please use this when setting your own notification preferences. 

When your content is available, you will receive DMs like these:

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/DM-New-Epp.png" width="40%" alt="DM New Episode">

<img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/DM-Season.png" width="40%" alt="DM Season">

### Email Notifications (Coming Soon)
Email notification support is on our roadmap but not yet implemented.

## Configuration

Pulsarr should be configured via the web UI, however, it can also be configured by .env variables. Any value passed through the .env will supersede any values within the db config. 

### Core Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `port` | Backend port | `3003` |
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
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Genre-Route.png" alt="Genre Route" width="80%"/>
</div>

## API Documentation

Pulsarr includes built-in API documentation accessible at `/api/docs` when running the server.

## Roadmap

- Email notifications

## License

Pulsarr is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

## Contributors

- [jamcalli](https://github.com/jamcalli)

## Acknowledgements

- [Plex](https://www.plex.tv/)
- [Sonarr](https://sonarr.tv/)
- [Radarr](https://radarr.video/)
- [Fastify](https://www.fastify.io/)
- [Discord.js](https://discord.js.org/)
- [Watchlistarr](https://github.com/nylonee/watchlistarr/)

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/jamcalli/pulsarr/issues) on GitHub.
