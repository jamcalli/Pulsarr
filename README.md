<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/icons/pulsarr.svg" alt="Pulsarr Logo" width="150"/>
  <h1>Pulsarr</h1>
  <p>Real-time Plex watchlist monitoring, routing, and notification center</p>

  ![Version](https://img.shields.io/github/v/release/jamcalli/pulsarr?style=flat-square)
  ![License](https://img.shields.io/badge/license-GPL-blue?style=flat-square)
  ![Node](https://img.shields.io/badge/node-24%20LTS-green?style=flat-square)
  ![Status](https://img.shields.io/badge/status-early--release-orange?style=flat-square)
  [![Discord](https://img.shields.io/discord/1407082466958774313?label=Discord&logo=discord&style=flat-square)](https://discord.gg/9csTEJn5cR)
  ![Docker Pulls](https://img.shields.io/docker/pulls/lakker/pulsarr?style=flat-square)
  ![Docker Image Size](https://img.shields.io/docker/image-size/lakker/pulsarr?style=flat-square)
  ![GitHub Stars](https://img.shields.io/github/stars/jamcalli/pulsarr?style=flat-square)
</div>

---

<h2 align="center">Love Pulsarr? Give Us a Star! ⭐</h2>

If Pulsarr has simplified your media management, please star this repository! It takes just a second, helps others find us, and motivates continued development. Thank you for being part of our community!

<p align="center">
  <a href="https://github.com/jamcalli/pulsarr/stargazers">
    <img src="https://reporoster.com/stars/dark/jamcalli/pulsarr?max=6" alt="Stargazers repo roster for @jamcalli/pulsarr" style="border: 1px solid #30363d; border-radius: 6px;" />
  </a>
</p>

---

Pulsarr bridges Plex watchlists with Sonarr and Radarr for real-time media monitoring and automated content acquisition—**all from within the Plex app, no extra logins required.**

Features include multi-user watchlist sync, intelligent content routing, approval workflows with quotas, and notifications via Discord and Apprise.

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

### API Documentation

Our REST API is fully documented and accessible in two ways:

- **Public Documentation**: [https://jamcalli.github.io/Pulsarr/docs/api-documentation](https://jamcalli.github.io/Pulsarr/docs/api-documentation)
- **Interactive Docs**: Every Pulsarr instance includes built-in Scalar API documentation at `http://localhost:3003/api/docs`

## 🚀 Quick Start

### Docker Installation (Recommended)

1. Create a `.env` file:
```env
# ⚠️ CRITICAL: Pulsarr's address as seen from Sonarr/Radarr containers (for webhooks)
# This MUST be reachable from your *arr containers or webhooks will fail!
# Examples:
#   http://pulsarr         - Docker Compose (same network, use service name)
#   http://localhost       - Host networking
#   http://192.168.1.x     - Separate machines (use Pulsarr host's IP)
baseUrl=http://your-server-ip
port=3003                       # External port for webhook URLs (default: 3003)

# Your timezone
TZ=America/Los_Angeles
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


For detailed installation options, including Unraid, manual installation, and PostgreSQL setup, see the [documentation](https://jamcalli.github.io/Pulsarr/docs/installation/quick-start).

### Database Options

Pulsarr uses SQLite by default but can also be configured to use PostgreSQL.

See the [configuration documentation](https://jamcalli.github.io/Pulsarr/docs/installation/configuration) for PostgreSQL setup details.

## Hosted Deployment Options

[ElfHosted](https://store.elfhosted.com/elf/jamcalli/) offers managed Pulsarr hosting with pre-configured media server bundles.

## ✨ Key Features

- **Real-time Monitoring**: Instant watchlist updates for Plex Pass users (5-minute polling for non-Pass users)
- **Smart Content Routing**: Build rules with AND/OR logic using genre, user, language, year, certification, season, IMDb/RT/TMDB ratings, or streaming service. Rules can require approval or bypass quotas
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

## Community Integrations

- [Home Assistant Integration](https://github.com/SpaceFrags/pulsarr_enhanced_requests) - Community-maintained integration to manage Pulsarr requests from Home Assistant
- [Pulsarr Card](https://github.com/SpaceFrags/pulsarr-requests-card) - Community-maintained companion card for the HA integration

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](https://jamcalli.github.io/Pulsarr/docs/contributing) for details on:
- Fork and branch naming conventions
- Development workflow
- Pull request guidelines

## 💬 Support

- [Discord](https://discord.gg/9csTEJn5cR) - Help, discussions, and updates
- [GitHub Issues](https://github.com/jamcalli/pulsarr/issues) - Bug reports and feature requests

## Thank You

A big thank you to these amazing contributors who've helped build and maintain this project:

<a href="https://github.com/jamcalli/pulsarr/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jamcalli/pulsarr" alt="Contributors" />
</a>

## License

Pulsarr is licensed under the GPL. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Plex](https://www.plex.tv/) • [Sonarr](https://sonarr.tv/) • [Radarr](https://radarr.video/) • [Fastify](https://www.fastify.io/) • [Discord.js](https://discord.js.org/) • [Watchlistarr](https://github.com/nylonee/watchlistarr/)

---

<div align="center">
  <sub>Built with ❤️ for the self-hosted community</sub>
</div>
