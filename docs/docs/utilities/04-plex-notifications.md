---
sidebar_position: 5
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Notifications

Automatically configures webhooks in all your connected Sonarr and Radarr instances to keep your Plex libraries fresh without manual intervention.

## Quick Setup

1. Navigate to **Utilities → Plex Notifications**
2. Enter your Plex authentication token (defaults to setup token)
3. Click **Find Servers** to discover available Plex servers
4. Select your server or manually enter host, port, and SSL settings
5. Click **Save** to configure webhooks in all Sonarr and Radarr instances

<img src={useBaseUrl('/img/Plex-Notifications.png')} alt="Plex Notifications Setup Interface" />

## Configuration

| Field | Description |
|-------|-------------|
| **Plex Token** | Authentication token for Plex access |
| **Server Discovery** | Automatically find available Plex servers |
| **Host** | Plex server hostname or IP address |
| **Port** | Plex server port (default: 32400) |
| **Use SSL** | Enable HTTPS for secure connections |

## Features

- **Automatic Configuration**: Sets up webhooks in all connected Sonarr/Radarr instances
- **Server Discovery**: Built-in tool to find your Plex server
- **Content Synchronization**: Auto-refresh libraries when content changes
- **Multi-Instance Support**: Works across all your Sonarr/Radarr instances
- **SSL Support**: Secure HTTPS connections

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Server not discovered** | Verify Plex token; ensure server running and accessible; check network |
| **Webhooks not working** | Confirm server settings; verify Sonarr/Radarr connected; check Plex logs |

## API Reference

See the [Plex Notifications API documentation](/docs/api/configure-plex-notifications) for detailed endpoint information.