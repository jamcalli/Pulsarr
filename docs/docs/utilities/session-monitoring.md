---
sidebar_position: 4
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Session Monitoring

Automatically searches for upcoming episodes and seasons by monitoring what users are currently watching. When someone nears the end of a season, Pulsarr proactively downloads the next content.

## How It Works

1. **Monitors active Plex sessions** via polling (configurable interval)
2. **Calculates remaining episodes** in the current season
3. **Triggers searches** when users reach a threshold (e.g., 2 episodes remaining)
4. **Handles next seasons** automatically or via rolling monitoring

## Rolling Monitoring

Progressive downloading strategy that starts minimal and expands based on viewing:

- **Pilot Rolling**: Start with pilot only → expand to full season when watched → add seasons progressively
- **First Season Rolling**: Start with Season 1 → add Season 2 when nearing completion → continue expanding
- **Best for**: Testing user interest and managing storage efficiently

## Configuration

Navigate to **Utilities > Plex Session Monitoring**:

### Basic Settings
- **Enable Session Monitoring**: Toggle the feature on/off
- **Polling Interval**: How often to check for active sessions (default: 15 minutes)
- **Episode Threshold**: When to trigger searches (default: 2 episodes remaining)
- **Filter Users**: Optionally monitor only specific users

### Cleanup Settings
- **Automatic Reset**: Reset abandoned shows to original state after inactivity period
- **Progressive Cleanup**: Remove previous seasons as users advance, but only if no other users have watched those seasons within the inactivity period
- **Inactivity Reset Days**: Days to wait before considering content inactive for cleanup (default: 7 days)

## Rolling Monitoring Status

The interface provides real-time management of tracked shows:

### Active Shows
- **View button**: Displays all rolling monitored shows including master records and user tracking entries
- **Master records**: Have action buttons for management (shows without specific user)
- **User tracking entries**: Display "Tracking only" status

### Action Buttons (Master Records Only)
- **Reset**: Reverts show to original monitoring state and removes all user tracking entries
- **Delete**: Removes show from monitoring entirely, leaving current content in place

### Inactive Shows  
- **Shows**: Haven't been watched within the configured inactivity period (default: 7 days)
- **Based on**: `last_updated_at` field compared to inactivity threshold
- **View button**: Opens read-only table (no action buttons) showing shows eligible for reset
- **Reset button**: Only appears when inactive shows exist - bulk resets all inactive shows

### Manual Actions
- **Check Sessions**: Button in header - manually triggers session monitoring without waiting for polling interval
- **Reset All Inactive**: Button only appears in the Inactive section when there are inactive shows (⟲ icon)
- **View buttons**: Open detailed sheets showing all shows with management options

## Setup in Sonarr

Rolling monitoring options appear in:
- **Sonarr Instance Settings**: Set default rolling behavior for all content
- **Content Router Rules**: Apply rolling monitoring to specific content based on conditions

:::tip
Rolling monitoring options only appear when Session Monitoring is enabled.
:::

## Environment Configuration

Configure via `.env` file for Docker deployments:

```env
plexSessionMonitoring='{
  "enabled": true,
  "pollingIntervalMinutes": 15,
  "remainingEpisodes": 2,
  "filterUsers": [],
  "enableAutoReset": true,
  "inactivityResetDays": 7,
  "enableProgressiveCleanup": false
}'
```

:::warning
Environment variables override web UI settings **on app restart**. If `plexSessionMonitoring` is set in your `.env` file:
- Web UI changes work during the current session
- On app restart, the .env values will override any database changes
- Remove the environment variable from `.env` to persist web UI configuration changes
:::

<img src={useBaseUrl('/img/Plex-Session-Monitoring.png')} alt="Plex Session Monitoring Configuration Interface" />

## Troubleshooting

- **Sessions not detected**: Check Plex connection and polling interval
- **Searches not triggering**: Verify series exists in Sonarr with matching metadata  
- **Rolling monitoring issues**: Ensure Session Monitoring is enabled and content was added with rolling options

## Attribution

Inspired by [prefetcharr](https://github.com/p-hueber/prefetcharr) by p-hueber.