<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/icons/pulsarr.svg" alt="Pulsarr Logo" width="150"/>
  <h1>Pulsarr</h1>
  <p>Real-time Plex watchlist monitoring, routing, and notification center</p>

  ![Version](https://img.shields.io/github/v/release/jamcalli/pulsarr?style=flat-square)
  ![License](https://img.shields.io/badge/license-GPL-blue?style=flat-square)
  ![Docker Pulls](https://img.shields.io/docker/pulls/lakker/pulsarr?style=flat-square)
  ![GitHub Stars](https://img.shields.io/github/stars/jamcalli/pulsarr?style=flat-square)
</div>

Pulsarr bridges Plex watchlists with Sonarr and Radarr, enabling automated content acquisition directly from the Plex app. Monitor multiple users' watchlists, intelligently route content based on configurable rules, and receive notifications when media is ready.

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
baseUrl=http://your-server-ip
port=3003
TZ=America/Los_Angeles
logLevel=info
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

3. Start the service:
```bash
docker compose up -d
```

4. Access the web UI at `http://your-server:3003` to complete setup.

For detailed installation options including Unraid and manual installation, see the [documentation](https://jamcalli.github.io/Pulsarr/docs/installation/quick-start).

## ✨ Key Features

- **Real-time Monitoring**: Instant watchlist updates for Plex Pass users (20-minute polling for non-Pass users)
- **Smart Content Routing**: Route content based on genre, user, language, year, and more
- **Multi-User Support**: Monitor watchlists for friends and family with granular permissions
- **Flexible Notifications**: Discord bot, webhooks, and 80+ services via Apprise
- **Lifecycle Management**: Automatic content deletion when removed from watchlists
- **User Tagging**: Track who requested what content in Sonarr/Radarr
- **Web Interface**: Modern, mobile-friendly dashboard with detailed analytics

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](https://jamcalli.github.io/Pulsarr/docs/contributing) for details on:
- Fork and branch naming conventions
- Development workflow
- Pull request guidelines

## 📜 License

Pulsarr is licensed under the GPL License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- [Plex](https://www.plex.tv/) • [Sonarr](https://sonarr.tv/) • [Radarr](https://radarr.video/)
- [Fastify](https://www.fastify.io/) • [Discord.js](https://discord.js.org/) • [Watchlistarr](https://github.com/nylonee/watchlistarr/)

## 💬 Support

Need help? [Open an issue](https://github.com/jamcalli/pulsarr/issues) on GitHub.

---

<div align="center">
  <sub>Built with ❤️ for the self-hosted community</sub>
</div>