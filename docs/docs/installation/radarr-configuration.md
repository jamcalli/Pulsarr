---
sidebar_position: 5
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Radarr Configuration

Configure your Radarr instances to manage movie downloads and monitoring.

<img src={useBaseUrl('/img/Radarr-Instance-Card.png')} alt="Radarr Instance Configuration" />

## Quick Setup

1. Navigate to **Radarr** in Pulsarr
2. Click **Add Instance**
3. Enter your Radarr URL and API key (Settings → General → Security)
4. Select quality profile and root folder
5. Set minimum availability preference
6. Save and test connection

## Connection Settings

| Setting | Required | Description |
|---------|----------|-------------|
| **Name** | Yes | Unique display name for this instance |
| **Base URL** | Yes | Radarr URL without trailing slash (e.g., `http://localhost:7878`) |
| **API Key** | Yes | From Radarr: Settings → General → Security |

## Content Management

| Setting | Required | Description |
|---------|----------|-------------|
| **Quality Profile** | Yes | Default quality profile for new movies |
| **Root Folder** | Yes | Default root folder for new movies |
| **Tags** | No | Tags to apply to new content (can create new tags inline) |

## Monitoring Settings

| Setting | Description |
|---------|-------------|
| **Minimum Availability** | When movie is considered available for download |
| **Monitor** | What to monitor when adding movies |

### Minimum Availability Options

| Option | Description |
|--------|-------------|
| `Announced` | As soon as movie is announced |
| `In Cinemas` | When movie is in theaters |
| `Released` | When movie is released (default) |

### Monitor Options

| Option | Description |
|--------|-------------|
| `Movie Only` | Monitor only the movie (default) |
| `Movie and Collection` | Monitor movie and its collection |
| `None` | Don't monitor |

## Other Settings

| Setting | Description |
|---------|-------------|
| **Search on Add** | Auto-search when added (default: enabled) |
| **Bypass Ignored** | Bypass Radarr's ignored items (default: disabled) |
| **Is Default** | Use as fallback when no routing rules match |
| **Synced Instances** | Other instances to sync content with |
