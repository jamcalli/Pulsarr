import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Label Sync

Automatically synchronize Plex labels based on user watchlists and content requests, keeping your Plex library organized and trackable.

## Quick Setup

1. Navigate to **Utilities → Plex Label Sync**
2. Toggle **Enable Label Sync** to `ON`
3. Configure label prefix (default: "pulsarr")
4. Optionally enable **Tag Sync** to sync Radarr/Sonarr tags to Plex labels
5. Click **Sync Labels** to apply labels to existing content

## Label Types

| Type | Format | Description |
|------|--------|-------------|
| **User Labels** | `pulsarr:username` | Track which users requested content (multi-user supported) |
| **Tag Labels** | Synced from Arr | Radarr/Sonarr tags synced to Plex labels in real-time |
| **Removed Labels** | Configurable | Remove, keep, or replace with special label when users removed |

## Configuration

### Label Configuration

| Setting | Description |
|---------|-------------|
| **Enable Label Sync** | Toggle feature on/off |
| **Label Prefix** | Customize prefix for user labels (default: "pulsarr") |
| **Concurrency Limit** | Control processing speed (1-20, default: 5) |

### Cleanup Settings

| Setting | Description |
|---------|-------------|
| **Cleanup Orphaned Labels** | Remove labels for deleted users |
| **Auto Reset on Scheduled Sync** | Automatically reset labels before scheduled sync operations |
| **Removed Label Mode** | `remove`: delete labels, `keep`: preserve for history, `special-label`: replace with custom prefix |
| **Removed Label Prefix** | Custom prefix for removed user labels (only when mode is `special-label`) |

### Tag Sync Configuration

| Setting | Description |
|---------|-------------|
| **Enable Tag Sync** | Sync Radarr/Sonarr tags to Plex labels |
| **Sync Radarr Tags** | Toggle syncing tags from Radarr instances |
| **Sync Sonarr Tags** | Toggle syncing tags from Sonarr instances |

### Full Sync Schedule

| Setting | Description |
|---------|-------------|
| **Schedule Time** | Automatically run full sync at specific time |
| **Day of Week** | Choose days for scheduled sync |

## Actions

| Action | Description |
|--------|-------------|
| **Automatic** | Webhook-triggered on Arr import/upgrade/rename events |
| **Scheduled** | Run full sync at configured time/days |
| **Sync Labels** | Manual immediate sync |
| **Clean Up** | Remove orphaned labels (requires **Cleanup Orphaned Labels** enabled) |
| **Remove Pulsarr Labels** | Remove all Pulsarr-created labels from Plex (destructive) |

:::warning
**Remove Pulsarr Labels** deletes all labels matching your prefix from Plex. This cannot be undone. Run a full sync to recreate them.
:::

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Labels not appearing** | Verify Plex connection/permissions; check content exists in Plex; confirm prefix config |
| **Webhook updates not working** | Verify Arr webhook config; check endpoint URL; review logs |
| **Performance issues** | Reduce concurrency limit; schedule during off-peak; enable orphaned cleanup |

## Best Practices

- Schedule full syncs during off-peak hours to minimize Plex API load
- Enable "Cleanup Orphaned Labels" to keep Plex labels tidy as users are removed
- Use a distinctive label prefix to avoid conflicts with manually-created Plex labels
- Start with user labels before enabling tag sync to keep label volume manageable

:::tip User Tagging vs Label Sync
[User Tagging](/docs/utilities/user-tagging) adds user tags in **Sonarr/Radarr**. Label Sync adds user labels in **Plex**. Enable both for full tracking across your stack.
:::

## API Reference

See the [Plex Labels API documentation](/docs/api/sync-plex-labels) for detailed endpoint information.
