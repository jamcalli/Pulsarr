<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/icons/pulsarr.svg" alt="Pulsarr Logo" width="150"/>
  <h1>Pulsarr</h1>
  <p>Pulsarr turns Plex watchlists into Sonarr and Radarr requests</p>

  ![Version](https://img.shields.io/github/v/release/jamcalli/pulsarr?style=flat-square)
  ![License](https://img.shields.io/badge/license-GPL-blue?style=flat-square)
  ![Bun](https://img.shields.io/badge/bun-%3E%3D1.4-green?style=flat-square&logo=bun&logoColor=white)
  [![Discord](https://img.shields.io/discord/1407082466958774313?label=Discord&logo=discord&style=flat-square)](https://discord.gg/9csTEJn5cR)
  ![Docker Pulls](https://img.shields.io/docker/pulls/lakker/pulsarr?style=flat-square)
  ![Docker Image Size](https://img.shields.io/docker/image-size/lakker/pulsarr/latest?style=flat-square)
  ![GitHub Stars](https://img.shields.io/github/stars/jamcalli/pulsarr?style=flat-square)
</div>

---

Pulsarr is a Plex watchlist monitor for Sonarr and Radarr. It watches the watchlists of your Plex account and your Plex friends, sends new titles to a Sonarr or Radarr instance, and notifies the people who added them when they're available. Users do all of it from the Plex app, with no separate account to log into.

Pulsarr works through Plex friendship. It can only read the watchlists of people who are friends of the Plex account that owns the server, and each friend's watchlist has to be visible to friends in their Plex privacy settings. A private watchlist looks empty.

<div align="center">
  <img src="https://raw.githubusercontent.com/jamcalli/pulsarr/master/assets/screenshots/home.png" alt="Pulsarr home page" width="90%"/>
</div>

## Quick start

Create a `.env` with your time zone and a `docker-compose.yml` next to it, then run `docker compose up -d` and open `http://<your-server>:3003`.

```bash
TZ=America/Los_Angeles
```

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

The image is also published as `ghcr.io/jamcalli/pulsarr`.

Other settings go in `.env` or under `environment:`. The time zone is all first-run setup needs. The [quick start guide](https://jamcalli.github.io/Pulsarr/installation/quick-start) covers the rest, including the Plex privacy setting.

## Features

- **Watchlist sync.** New items are picked up within seconds with Plex Pass, and about every five minutes without it.
- **Multi-user.** Your friends' watchlists too, with per-user sync, approval, notification and quota settings.
- **Content routing.** A predicate rule builder with nested all/any/not groups. Conditions: Genres, User, Plex list, Year, Language, Certification, Streaming services, IMDb rating, IMDb votes, RT critic score, RT audience score, TMDB rating, Season, Series status and Movie status. Each route picks the instance, root folder, quality profile, monitoring and tags, or skips the title, and can require approval or bypass quotas. One request can go to several instances.
- **Multiple Sonarr and Radarr instances.** Connect as many as you like and copy content between them.
- **Approvals and quotas.** Hold requests for your decision and cap how much each user can request, from the web UI or Discord.
- **Delete sync.** Remove content once nobody wants it, by watchlist or by tag, with playlist protection.
- **Exclusions.** Block titles from being requested, for one user or everyone.
- **Session monitoring.** Grow rolling shows in Sonarr as people watch them.
- **User tags and Plex labels.** Mark content in Sonarr, Radarr and Plex by who has it on their watchlist.
- **Notifications.** Discord bot and channels, Plex mobile push, webhooks, and anything Apprise reaches.
- **REST API.** Everything the web UI does, with API keys and interactive docs at `/api/docs`.

## Documentation

Everything is at [jamcalli.github.io/Pulsarr](https://jamcalli.github.io/Pulsarr/). Start with [how Pulsarr works](https://jamcalli.github.io/Pulsarr/how-it-works), then [installation](https://jamcalli.github.io/Pulsarr/installation) for Docker, the native installers for Linux, Windows and macOS, and PostgreSQL.

## Hosted option

[ElfHosted](https://store.elfhosted.com/product/pulsarr/elf/jamcalli/?utm_source=github&utm_medium=readme&utm_campaign=pulsarr-readme) offers managed Pulsarr hosting with pre-configured media server bundles. 33% of every Pulsarr subscription supports the project.

## Community integrations

- [Home Assistant integration](https://github.com/SpaceFrags/pulsarr_enhanced_requests), community maintained, manages Pulsarr requests from Home Assistant.
- [Pulsarr card](https://github.com/SpaceFrags/pulsarr-requests-card), the companion card for that integration.

## Transparency

Pulsarr began as a TypeScript rewrite of Watchlistarr and has grown with contributions from the community. It's developed with AI assistance. Every decision about architecture, features and direction is made by a person, and every change is reviewed before it ships.

Security is a priority. Renovate keeps dependencies current, auth follows Fastify best practices, and every endpoint is protected by default. To report a security concern, see [SECURITY.md](.github/SECURITY.md).

## Contributing

Pull requests are welcome. Fork the repo, branch from `develop`, and open the PR against `develop`.

## Support

- [Discord](https://discord.gg/9csTEJn5cR) for help, discussion and updates.
- [GitHub issues](https://github.com/jamcalli/pulsarr/issues) for bug reports and feature requests.

## Acknowledgements

- [Plex](https://www.plex.tv/) • [Sonarr](https://sonarr.tv/) • [Radarr](https://radarr.video/) • [Fastify](https://www.fastify.io/) • [Discord.js](https://discord.js.org/) • [Watchlistarr](https://github.com/nylonee/watchlistarr/)

## License

Pulsarr is licensed under the GPL. See the [LICENSE](LICENSE) file for details.

## Repository activity

![Repobeats analytics](https://repobeats.axiom.co/api/embed/1f978002c5cd8d37e83f1effcd593f2c534354a3.svg "Repobeats analytics image")

## Star history

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
