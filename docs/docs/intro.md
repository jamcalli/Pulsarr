---
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Introduction to Pulsarr

<div align="center">
  <img src={useBaseUrl('/img/pulsarr.svg')} alt="Pulsarr Logo" width="150"/>
  <p><strong>Real-time Plex watchlist monitoring, routing, and notification center</strong></p>
</div>

Pulsarr bridges Plex watchlists with Sonarr and Radarr, enabling automated content acquisition directly from the Plex app. No additional services required for your users - all the magic happens from the primary user's Plex Token.

<img src={useBaseUrl('/img/Dashboard1.png')} alt="Pulsarr Dashboard" />

## Quick Start

1. **Deploy** via [Docker](installation/quick-start) or standalone installation
2. **Connect** your Plex account and Sonarr/Radarr instances
3. **Configure** routing rules and notifications
4. **Done** - users add to Plex watchlists, content appears automatically

:::tip Plex Pass Optional
Real-time RSS monitoring requires Plex Pass. Without it, Pulsarr polls every 5 minutes. All other features work identically.
:::

## Core Features

| Feature | Description |
|---------|-------------|
| **Watchlist Monitoring** | Real-time RSS feeds (Plex Pass) or staggered polling cycling through users every 5 minutes |
| **Content Routing** | Build custom rules with AND/OR logic using genre, user, language, year, certification, season count, IMDb/RT/TMDB ratings, or streaming service. Rules can require approvals or bypass quotas |
| **Approvals & Quotas** | Admin approval workflows with daily/weekly/monthly limits per user |
| **Multi-Instance** | Sync content across multiple Sonarr/Radarr instances simultaneously |
| **Notifications** | Discord, Apprise (80+ services), native webhooks, Tautulli (Plex mobile app), and public broadcasts |
| **User Management** | Granular controls, tag-based tracking, automatic multi-user monitoring |
| **Plex Label Sync** | Sync user labels to Plex content, import Radarr/Sonarr tags as Plex labels |
| **Delete Sync** | Automatically remove content when users remove from watchlists |
| **Session Monitoring** | Auto-search next seasons when users near end of current season |
| **Plex Library Refresh** | Auto-configure webhooks in Sonarr/Radarr to refresh Plex libraries instantly |
| **Playlist Protection** | Preserve important content from automatic deletion |
| **Modern Web Interface** | Mobile-friendly dashboard with statistics and built-in API docs |

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Plex     │ ──▶ │   Pulsarr   │ ──▶ │   Sonarr/   │ ──▶ │  Available  │
│  Watchlist  │     │   Router    │     │   Radarr    │     │  in Plex    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │ ▲                 │
                    ┌──────┴─┼─────┐           │
                    │ Approvals    │◀──────────┘
                    │ Quotas       │  Webhooks (auto-configured)
                    │ Notify       │  for instant availability
                    └─────────────┘
```

1. **Content Detection** - Monitor Plex watchlists in real-time (Plex Pass) or via interval polling. Detect when users add movies or TV shows.

2. **Content Analysis** - Evaluate metadata (genres, language, year), apply routing rules, check user quotas, and determine target instance(s).

3. **Approval Processing** - If required, create approval requests, notify administrators via Discord/webhooks, and allow approval, rejection, or automatic expiration.

4. **Automatic Acquisition** - Route approved content to Sonarr/Radarr with configured quality profiles, root folders, and monitoring settings.

5. **Notification Delivery** - Send personalized notifications when content is available. Support for Discord, Apprise, webhooks, and public channel broadcasts.

6. **Lifecycle Management** - Optional automatic deletion when content leaves watchlists, with Plex playlist protection for preserving important content.

## Next Steps

- [Quick Start Guide](installation/quick-start) - Get up and running in minutes
- [Content Routing](features/content-routing) - Configure intelligent routing rules
- [Approval System](features/approval-and-quota-system) - Set up user quotas and approvals
- [Discord Integration](notifications/discord) - Enable rich notifications
