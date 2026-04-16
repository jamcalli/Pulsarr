<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/icons/pulsarr.svg" alt="Pulsarr Logo" width="150"/>
  <h1>Pulsarr</h1>
  <p>Real-time Plex watchlist monitoring, routing, and notification center</p>

  ![Version](https://img.shields.io/github/v/release/jamcalli/pulsarr?style=flat-square)
  ![License](https://img.shields.io/badge/license-GPL-blue?style=flat-square)
  ![Bun](https://img.shields.io/badge/bun-%3E%3D1.3-green?style=flat-square)
  ![Status](https://img.shields.io/badge/status-early--release-orange?style=flat-square)
  [![Discord](https://img.shields.io/discord/1407082466958774313?label=Discord&logo=discord&style=flat-square)](https://discord.gg/9csTEJn5cR)
  ![Docker Pulls](https://img.shields.io/docker/pulls/lakker/pulsarr?style=flat-square)
  ![Docker Image Size](https://img.shields.io/docker/image-size/lakker/pulsarr/latest?style=flat-square)
  ![GitHub Stars](https://img.shields.io/github/stars/jamcalli/pulsarr?style=flat-square)
</div>

---

Pulsarr bridges Plex watchlists with Sonarr and Radarr for real-time media monitoring and automated content acquisition, **all from within the Plex app, no extra logins required.**

Features include multi-user watchlist sync, intelligent content routing, approval workflows with quotas, and notifications via Discord, Plex mobile push, and Apprise.

<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/Dashboard1.png" alt="Dashboard" width="80%"/>
</div>

## 📚 Documentation

Full documentation is available at: **[https://jamcalli.github.io/Pulsarr/](https://jamcalli.github.io/Pulsarr/)**

- [Quick Start Guide](https://jamcalli.github.io/Pulsarr/docs/installation/quick-start)
- [Native Installation](https://jamcalli.github.io/Pulsarr/docs/installation/native-installation)
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
    environment:
      - PUID=1000
      - PGID=1000
    restart: unless-stopped
    env_file:
      - .env
```


3. Pull and start the service:
```bash
docker compose pull && docker compose up -d
```

4. Access the web UI at `http://your-server:3003` to complete setup.

> **Synology NAS / Legacy Systems:** If you're running on a Synology NAS or a system with Linux kernel < 4.11, use `lakker/pulsarr:node` instead. This alternative image uses Node.js runtime instead of Bun, avoiding kernel compatibility issues. Both images are functionally identical.


### Native Installation

Standalone builds with easy installers are available for Linux, macOS, and Windows. No Docker or runtime install required.

| Platform | Install Method |
|----------|---------------|
| **Linux** | `curl -fsSL https://raw.githubusercontent.com/jamcalli/Pulsarr/master/scripts/installers/linux/install.sh \| sudo bash` (automatically selects `baseline` variant for older CPUs without AVX2) |
| **Windows** | Download and run `pulsarr-vX.X.X-windows-x64-setup.exe` from the [latest release](https://github.com/jamcalli/pulsarr/releases/latest) (use `baseline` variant for older CPUs without AVX2) |
| **macOS** | Download `pulsarr-vX.X.X-macos-{arch}.dmg` from the [latest release](https://github.com/jamcalli/pulsarr/releases/latest) |

See the [Native Installation Guide](https://jamcalli.github.io/Pulsarr/docs/installation/native-installation) for detailed instructions, service management, and manual options.

### Database Options

Pulsarr uses SQLite by default but can also be configured to use PostgreSQL.

See the [configuration documentation](https://jamcalli.github.io/Pulsarr/docs/installation/configuration) for PostgreSQL setup details.

## Hosted Deployment Options

[ElfHosted](https://store.elfhosted.com/elf/jamcalli/) offers managed Pulsarr hosting with pre-configured media server bundles.

## ✨ Key Features

- **Real-time Monitoring**: Instant watchlist updates for Plex Pass users (5-minute staggered polling for non-Pass users)
- **Smart Content Routing**: Build rules with AND/OR logic using genre, user, language, year, certification, season, IMDb/RT/TMDB ratings, or streaming service. Rules can require approval or bypass quotas
- **Approval & Quota System**: Administrative approval workflows with configurable user quotas (daily/weekly/monthly limits)
- **Plex Label Sync**: Automatically sync user watchlists and Radarr/Sonarr tags as Plex labels with real-time webhook updates
- **Multi-Instance Support**: Distribute content across multiple Sonarr/Radarr instances 
  with intelligent synchronization
- **Multi-User Support**: Monitor watchlists for friends and family with granular permissions
- **Discord Bot Integration**: Complete approval management directly from Discord with interactive commands
- **Flexible Notifications**: Discord bot, Plex mobile push, webhooks, and 80+ services via Apprise
- **Advanced Lifecycle Management**: Watchlist-based or tag-based deletion with playlist protection
- **Plex Session Monitoring**: Auto-search for next seasons when users near season finales
- **User Tagging**: Track who requested what content in Sonarr/Radarr
- **Comprehensive Analytics**: Detailed dashboards with usage stats, genre analysis, and content distribution
- **Automatic Plex Updates**: Configures webhooks for instant library refreshes
- **Developer-Friendly API**: Full REST API with interactive documentation

## Community Integrations

- [Home Assistant Integration](https://github.com/SpaceFrags/pulsarr_enhanced_requests) - Community-maintained integration to manage Pulsarr requests from Home Assistant
- [Pulsarr Card](https://github.com/SpaceFrags/pulsarr-requests-card) - Community-maintained companion card for the HA integration

## Transparency

Pulsarr started in early 2024 while I was home with a newborn, wanting to explore what AI coding tools could actually do. Watchlistarr had some bugs I wanted to fix, but it was written in Scala and I had no idea how to work with it, so I used AI to help me rewrite it in TypeScript instead. I threw together a basic UI, posted it, and didn't think much of it. The conversation around AI-assisted development has shifted a lot since then, and I think it's important to be upfront about how this project is built.

I'm not a software engineer by trade and I used this project as a way to learn. I didn't expect it to become what it is. Over the past 16 months I've kept developing, supporting, and iterating on it using my own judgment and research, with AI tools playing a role throughout. Every decision about architecture, features, and direction is my own, and everything is reviewed before it ships. If you ever spot anything I've missed or that's cause for concern, please reach out.

I take security seriously. Renovate keeps dependencies current, auth follows Fastify best practices, and all endpoints are protected by default. I'm always learning and welcome the feedback.

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](https://jamcalli.github.io/Pulsarr/docs/contributing) for details on:
- Fork and branch naming conventions
- Development workflow
- Pull request guidelines

## 💬 Support

- [Discord](https://discord.gg/9csTEJn5cR) - Help, discussions, and updates
- [GitHub Issues](https://github.com/jamcalli/pulsarr/issues) - Bug reports and feature requests

## Acknowledgements

- [Plex](https://www.plex.tv/) • [Sonarr](https://sonarr.tv/) • [Radarr](https://radarr.video/) • [Fastify](https://www.fastify.io/) • [Discord.js](https://discord.js.org/) • [Watchlistarr](https://github.com/nylonee/watchlistarr/)

## License

Pulsarr is licensed under the GPL. See the [LICENSE](LICENSE) file for details.

## Repository Activity

![Repobeats analytics](https://repobeats.axiom.co/api/embed/1f978002c5cd8d37e83f1effcd593f2c534354a3.svg "Repobeats analytics image")

## Star History

<a href="https://star-history.com/#jamcalli/pulsarr&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=jamcalli/pulsarr&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=jamcalli/pulsarr&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=jamcalli/pulsarr&type=Date" />
 </picture>
</a>

## Contributors

<a href="https://github.com/jamcalli/pulsarr/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jamcalli/pulsarr" alt="Contributors" />
</a>

---

<div align="center">
  <sub>Built with ❤️ for the self-hosted community</sub>
</div>
