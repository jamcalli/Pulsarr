---
sidebar_position: 4
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Session Monitoring

Automatically searches for upcoming episodes and seasons by monitoring what users are currently watching. When someone nears the end of a season, Pulsarr proactively downloads the next content.

## Quick Setup

1. Navigate to **Utilities → Plex Session Monitoring**
2. Toggle **Enable Session Monitoring** to `ON`
3. Configure polling interval (default: 15 minutes)
4. Set episode threshold (default: 2 episodes remaining)
5. Optionally filter specific users
6. Click **Save** to activate monitoring

<img src={useBaseUrl('/img/Plex-Session-Monitoring.png')} alt="Plex Session Monitoring Configuration Interface" />

## How It Works

1. **Monitors active Plex sessions** via polling (configurable interval)
2. **Calculates remaining episodes** in the current season
3. **Triggers searches** when users reach a threshold (e.g., 2 episodes remaining)
4. **Handles next seasons** automatically or via rolling monitoring

## Rolling Monitoring

Progressive downloading strategy that starts minimal and expands based on viewing activity, with automatic cleanup when shows are abandoned:

- **Pilot Rolling**: Start with pilot only → expand to full season when watched → add seasons progressively
- **First Season Rolling**: Start with Season 1 → add Season 2 when nearing completion → continue expanding
- **Auto-cleanup**: Automatically reverts shows to original monitoring states when nobody is watching
- **Best for**: Testing user interest and managing storage efficiently

## Configuration

### Basic Settings

| Setting | Description |
|---------|-------------|
| **Enable Session Monitoring** | Toggle the feature on/off |
| **Polling Interval** | How often to check sessions (default: 15 minutes) |
| **Episode Threshold** | When to trigger searches (default: 2 episodes remaining) |
| **Filter Users** | Optionally monitor only specific users |

### Cleanup Settings

| Setting | Description |
|---------|-------------|
| **Automatic Reset** | Reset abandoned shows after inactivity period |
| **Progressive Cleanup** | Remove previous seasons as users advance (respects other user activity) |
| **Inactivity Reset Days** | Days before content considered inactive (default: 7) |

## Status & Actions

| Action | Description |
|--------|-------------|
| **View Active** | Shows all rolling monitored content with master records and user tracking |
| **View Inactive** | Shows content not watched within inactivity period |
| **Reset** | Reverts show to original monitoring state (master records only) |
| **Delete** | Removes from monitoring, keeps current content |
| **Check Sessions** | Manually trigger monitoring without waiting for poll |
| **Reset All Inactive** | Bulk reset all inactive shows |

## Setup in Sonarr

Rolling monitoring options appear in:
- **Sonarr Instance Settings**: Set default rolling behavior for all content
- **Content Router Rules**: Apply rolling monitoring to specific content based on conditions

:::tip
Rolling monitoring options only appear when Session Monitoring is enabled.
:::

## Best Practices

- Start with conservative thresholds (2-3 episodes remaining)
- Use user filtering to monitor specific groups
- Enable progressive cleanup to manage storage efficiently
- Adjust polling intervals based on viewing patterns

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Sessions not detected** | Verify Plex connection; check polling interval; ensure users watching content |
| **Searches not triggering** | Verify series exists in Sonarr with metadata; check threshold config; review logs |
| **Rolling monitoring issues** | Ensure feature enabled; confirm content added with rolling options; check Sonarr modifications |

## API Reference

See the [Session Monitoring API documentation](/docs/api/run-session-monitor) for detailed endpoint information.

## Attribution

Inspired by [prefetcharr](https://github.com/p-hueber/prefetcharr) by p-hueber.