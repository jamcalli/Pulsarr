---
sidebar_position: 5
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Notifications

## Automatic Library Updates

Pulsarr's Plex Notifications feature automatically configures webhooks in all your connected Sonarr and Radarr instances to keep your Plex libraries fresh without manual intervention.

### Key Features

- **Automatic Configuration**: Sets up notification webhooks in all connected Sonarr and Radarr instances
- **Server Discovery**: Easily find and select your Plex server with the built-in discovery tool
- **Content Synchronization**: Keeps your Plex libraries updated when content is added, removed, or modified
- **Multi-Instance Support**: Works across all your Sonarr and Radarr instances simultaneously
- **SSL Support**: Secure connections to your Plex server

### Setup Instructions

1. Navigate to the **Utilities** section in the Pulsarr web interface
2. Enter your Plex authentication token (defaults to the token provided during setup)
3. Click "Find Servers" to automatically discover available Plex servers
4. Select your server or manually enter your Plex host, port, and SSL settings
5. Save your changes to automatically configure webhooks in all Sonarr and Radarr instances

<img src={useBaseUrl('/img/Plex-Notifications.png')} alt="Plex Notifications Setup Interface" />

Once configured, anytime content is added, modified, or removed via Sonarr or Radarr, your Plex libraries will automatically refresh to reflect these changes.