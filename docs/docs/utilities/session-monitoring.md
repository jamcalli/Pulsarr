import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Session Monitoring

Automatically searches for upcoming episodes and seasons by monitoring what users are currently watching. When someone nears the end of a season, Pulsarr proactively downloads the next content.

## Quick Setup

1. Navigate to **Utilities → Plex Session Monitoring**
2. Toggle **Enable** to turn on monitoring
3. Configure settings (SSE connects automatically; polling serves as fallback)
4. Set episode threshold (default: 2 episodes remaining)
5. Optionally filter to specific users
6. Click **Save Changes**

<img src={useBaseUrl('/img/Plex-Session-Monitoring.png')} alt="Plex Session Monitoring Configuration Interface" />

## How It Works

1. **Monitors active Plex sessions** in real time via Plex SSE (Server-Sent Events), with polling as a fallback
2. **Calculates remaining episodes** in the current season
3. **Triggers searches** when users reach a threshold (e.g., 2 episodes remaining)
4. **Handles next seasons** automatically or via rolling monitoring

A live SSE connection status badge appears in the page header, showing whether real-time monitoring is active or if the system has fallen back to polling.

## Rolling Monitoring

Progressive downloading strategy that starts minimal and expands based on viewing activity, with automatic cleanup when shows are abandoned:

- **Pilot Rolling**: Start with pilot only → expand to full season when watched → add seasons progressively
- **First Season Rolling**: Start with Season 1 → add Season 2 when nearing completion → continue expanding
- **All Season Pilot Rolling**: Download the pilot of every season upfront → each season expands to full when its pilot is watched
- **Auto-cleanup**: Automatically reverts shows to original monitoring states when nobody is watching
- **Best for**: Testing user interest and managing storage efficiently

### Example: Pilot Rolling Flow

With a threshold of 2 episodes remaining:

1. User adds **Breaking Bad** to their Plex watchlist → Pulsarr sends to Sonarr with **Pilot Rolling** → only S01E01 downloads
2. User starts watching S01E01 → Pulsarr detects the session and searches for the **full Season 1**
3. User reaches S01E05 (2 episodes remaining in a 7-episode season) → Pulsarr requests **Season 2** from Sonarr
4. User reaches S02E11 → Pulsarr requests **Season 3**, and so on through the series
5. User stops watching mid-Season 3 → after the inactivity period (default: 7 days), **auto-cleanup** reverts the show to its original monitoring state

**First Season Rolling** works the same way but starts with the full Season 1 instead of just the pilot. Useful when you want users to have a full season available upfront.

### Example: All Season Pilot Rolling Flow

1. User adds **The Office** to their Plex watchlist → Pulsarr sends to Sonarr with **All Season Pilot Rolling** → the pilot episode of every season downloads (S01E01, S02E01, S03E01, etc.)
2. User starts watching S01E01 → Pulsarr detects the session and searches for the **full Season 1**
3. User finishes Season 1 and starts watching S02E01 (already downloaded) → Pulsarr expands **Season 2** to full monitoring
4. User skips ahead to S05E01 → Pulsarr expands **Season 5** to full monitoring (seasons don't need to be watched in order)
5. User stops watching → after the inactivity period (default: 7 days), **auto-cleanup** reverts the show to its original state, keeping pilots but removing expanded episodes

Unlike Pilot Rolling and First Season Rolling, this type does not auto-expand to the next season based on the remaining episodes threshold. Instead, each season expands individually when its pre-downloaded pilot is watched.

## Configuration

### Monitoring Configuration

| Setting | Description |
|---------|-------------|
| **Polling Interval (minutes)** | Fallback polling frequency when SSE is unavailable (1-1440, default: 15) |
| **Remaining Episodes Threshold** | Trigger searches when this many episodes remain in a season (1-10, default: 2) |

### Filtering Options

| Setting | Description |
|---------|-------------|
| **Filter Users** | Multi-select of Plex users to monitor. Leave empty to monitor all users |

### Rolling Monitoring Reset Settings

| Setting | Description |
|---------|-------------|
| **Enable Automatic Reset** | Reset abandoned shows to their original monitoring state after inactivity period |
| **Enable Progressive Cleanup** | Remove previous seasons as users advance to the next, only if no other users are watching those seasons |
| **Inactivity Reset Days** | Days without watch activity before a show is considered inactive (1-365, default: 7) |
| **Auto Reset Check Interval (hours)** | How often to check for inactive shows and perform resets (1-168, default: 24) |

## Rolling Monitoring Status

The status section shows your rolling monitored content split into two views:

| View | Description |
|------|-------------|
| **Active Shows** | Currently monitored shows with user tracking. Shows which users are watching, monitoring type (Pilot/First Season/All Season Pilot), current season, and last activity |
| **Inactive Shows** | Shows not watched within the inactivity period. Can be bulk reset to reclaim storage |

### Per-Show Actions

| Action | Description |
|--------|-------------|
| **Reset** | Reverts show to original monitoring state (pilot-only or first-season-only) and deletes excess files |
| **Delete** | Removes show from rolling monitoring, keeps current content in Sonarr |

### Global Actions

| Action | Description |
|--------|-------------|
| **Check Sessions** | Manually trigger a session check without waiting for the next poll |
| **Manage Rolling** | Opens the rolling management sheet for bulk enrollment and monitoring type changes |
| **Reset All Inactive** | Bulk reset all inactive shows (with confirmation) |

:::warning
Resetting shows deletes excess episode files and loses all user viewing progress for that show.
:::

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
| **SSE not connected** | Pulsarr auto-discovers your server via Plex.tv. If discovery fails, manually set the URL in **Plex → Configuration → Server Connection** using the **Find Server** button |
| **Sessions not detected** | Verify Plex connection; check polling interval; ensure users watching content |
| **Searches not triggering** | Verify series exists in Sonarr with metadata; check threshold config; review logs |
| **Rolling monitoring issues** | Ensure feature enabled; confirm content added with rolling options; check Sonarr modifications |

## API Reference

See the [Session Monitoring API documentation](/docs/api/run-session-monitor) for detailed endpoint information.

## Attribution

Inspired by [prefetcharr](https://github.com/p-hueber/prefetcharr) by p-hueber.
