<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/icons/pulsarr.svg" alt="Pulsarr Logo" width="150"/>
  <h1>Pulsarr</h1>
  <p>Real-time Plex watchlist monitoring, routing, and notification center</p>

  ![Version](https://img.shields.io/github/v/release/jamcalli/pulsarr?style=flat-square)
  ![License](https://img.shields.io/badge/license-GPL-blue?style=flat-square)
  ![Node](https://img.shields.io/badge/node-22%20LTS-green?style=flat-square)
  ![Status](https://img.shields.io/badge/status-early--release-orange?style=flat-square)
  [![Discord](https://img.shields.io/discord/1407082466958774313?label=Discord&logo=discord&style=flat-square)](https://discord.gg/9csTEJn5cR)
  ![Docker Pulls](https://img.shields.io/docker/pulls/lakker/pulsarr?style=flat-square)
  ![Docker Image Size](https://img.shields.io/docker/image-size/lakker/pulsarr?style=flat-square)
  ![GitHub Stars](https://img.shields.io/github/stars/jamcalli/pulsarr?style=flat-square)
</div>

---

<h2 align="center">⭐ Love Pulsarr? Give Us a Star! ⭐</h2>

If Pulsarr has simplified your media management, please star this repository! It takes just a second, helps others find us, and motivates continued development. Thank you for being part of our community!

<p align="center">
  <a href="https://github.com/jamcalli/pulsarr/stargazers">
    <img src="https://reporoster.com/stars/dark/jamcalli/pulsarr?max=6" alt="Stargazers repo roster for @jamcalli/pulsarr" style="border: 1px solid #30363d; border-radius: 6px;" />
  </a>
</p>

---

Pulsarr is an integration tool that bridges Plex watchlists with Sonarr and Radarr, enabling real-time media monitoring and automated content acquisition all from within the Plex App itself.

Enjoy all the benefits of other content discovery systems without requiring users to use additional services. All the magic happens from the primary user's Plex Token.

It provides user-based watchlist synchronization for yourself and for friends, intelligent content routing based on multiple criteria, approval workflows with quota management, and notification capabilities (Discord and Apprise).

<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard1.png" alt="Dashboard" width="80%"/>
</div>

## 📚 Documentation

Full documentation is available at: **[https://jamcalli.github.io/Pulsarr/](https://jamcalli.github.io/Pulsarr/)**

- [Quick Start Guide](https://jamcalli.github.io/Pulsarr/docs/installation/quick-start)
- [Configuration](https://jamcalli.github.io/Pulsarr/docs/installation/configuration)
- [Discord Setup & Commands](https://jamcalli.github.io/Pulsarr/docs/notifications/discord)
- [Features & Guides](https://jamcalli.github.io/Pulsarr/docs/intro)
- [API Documentation](https://jamcalli.github.io/Pulsarr/docs/api-documentation)

## 🚀 Quick Start

### Docker Installation (Recommended)

1. Create a `.env` file:
```env
baseUrl=http://your-server-ip   # Address where Pulsarr can be reached
port=3003                       # Port where Pulsarr is accessible
TZ=America/Los_Angeles          # Set to your local timezone

# Logging Configuration
logLevel=info                   # Log level (default: info)
                                # Accepts: fatal | error | warn | info | debug | trace | silent

enableConsoleOutput=true        # Console logging (default: true)
                                # Any value other than "false" enables terminal output
                                # Logs are always written to ./data/logs/ regardless of this setting

enableRequestLogging=true       # HTTP request logging (default: true)
                                # Logs HTTP method, URL, host, remote IP/port, response codes, response times
                                # Sensitive query parameters (token, apiKey, password) are automatically redacted
```

2. Create `docker-compose.yml`:
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

3. Pull and start the service:
```bash
docker compose pull && docker compose up -d
```

4. Access the web UI at `http://your-server:3003` to complete setup.

### Logging Configuration

Pulsarr provides flexible logging configuration through environment variables:

**Log Levels** (`logLevel`)
- **Default**: `info`
- **Options**: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`
- Controls the minimum log level displayed and recorded

**Console Output** (`enableConsoleOutput`)
- **Default**: `true`
- **Behavior**: Any value other than `"false"` enables terminal output
- When disabled, logs are only written to files (see below)

**Request Logging** (`enableRequestLogging`)
- **Default**: `true`
- **Logs**: HTTP method, URL, host, remote IP/port, response codes, response times
- **Security**: Sensitive query parameters (`token`, `apiKey`, `password`) are automatically redacted

**File Logging**
- **Always enabled** - Cannot be disabled
- **Location**: `./data/logs/` directory
- **Format**: `pulsarr-YYYY-MM-DD.log` (with `pulsarr-current.log` for active file)
- **Rotation**: 10MB size limit, 7 max files, gzipped compression
- **Purpose**: Supports upcoming client-side log viewer feature

Console and file logging operate independently - you can disable console output while maintaining file logging for monitoring and troubleshooting.

For detailed installation options, including Unraid, manual installation, and PostgreSQL setup, see the [documentation](https://jamcalli.github.io/Pulsarr/docs/installation/quick-start).

### Database Options

Pulsarr uses SQLite by default but can also be configured to use PostgreSQL for users requiring external database access or high-scale deployments.

See the [configuration documentation](https://jamcalli.github.io/Pulsarr/docs/installation/configuration) for PostgreSQL setup details.

## Hosted Deployment Options

### ElfHosted

[ElfHosted](https://store.elfhosted.com/elf/jamcalli/) is a Platform-as-a-Service (PaaS) provider that offers managed hosting for self-hosted applications, including Pulsarr. The platform handles infrastructure management, security updates, and system maintenance, allowing users to focus on configuring and using their applications.

They provide pre-configured streaming media bundles that integrate Pulsarr with popular media server applications (Plex, Jellyfin, Emby) and automation tools (Radarr, Sonarr). The platform includes community support through their [Discord server](https://discord.elfhosted.com) and maintains [documentation](https://docs.elfhosted.com) for their services.

For users who prefer managed hosting over self-deployment, ElfHosted offers an alternative to manual installation and maintenance.

## ✨ Key Features

- **Real-time Monitoring**: Instant watchlist updates for Plex Pass users (20-minute polling for non-Pass users)
- **Smart Content Routing**: Route content based on genre, user, language, year, certification, and more
- **Approval & Quota System**: Administrative approval workflows with configurable user quotas (daily/weekly/monthly limits)
- **Plex Label Sync**: Automatically sync user watchlists and Radarr/Sonarr tags as Plex labels with real-time webhook updates
- **Multi-Instance Support**: Distribute content across multiple Sonarr/Radarr instances 
  with intelligent synchronization
- **Multi-User Support**: Monitor watchlists for friends and family with granular permissions
- **Discord Bot Integration**: Complete approval management directly from Discord with interactive commands
- **Flexible Notifications**: Discord bot, Tautulli, webhooks, and 80+ services via Apprise
- **Advanced Lifecycle Management**: Watchlist-based or tag-based deletion with playlist protection
- **Plex Session Monitoring**: Auto-search for next seasons when users near season finales
- **User Tagging**: Track who requested what content in Sonarr/Radarr
- **Comprehensive Analytics**: Detailed dashboards with usage stats, genre analysis, and content distribution
- **Automatic Plex Updates**: Configures webhooks for instant library refreshes
- **Developer-Friendly API**: Full REST API with interactive documentation

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](https://jamcalli.github.io/Pulsarr/docs/contributing) for details on:
- Fork and branch naming conventions
- Development workflow
- Pull request guidelines

## 💬 Support

- 💬 Join our [Discord community](https://discord.gg/9csTEJn5cR) for help, discussions, and updates
- Need help? [Open an issue](https://github.com/jamcalli/pulsarr/issues) on GitHub
- 🐛 Report bugs or request features
- 📖 Contribute to documentation

Your support helps keep this project active and growing!

## ❤️ Thank You

A big thank you to these amazing contributors who've helped build and maintain this project:

<a href="https://github.com/jamcalli/pulsarr/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jamcalli/pulsarr" alt="Contributors" />
</a>

## 📜 License

Pulsarr is licensed under the GPL. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- [Plex](https://www.plex.tv/) • [Sonarr](https://sonarr.tv/) • [Radarr](https://radarr.video/) • [Fastify](https://www.fastify.io/) • [Discord.js](https://discord.js.org/) • [Watchlistarr](https://github.com/nylonee/watchlistarr/)

---

<div align="center">
  <sub>Built with ❤️ for the self-hosted community</sub>
</div>
