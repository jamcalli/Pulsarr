---
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Delete Sync

Automatically removes content from Sonarr/Radarr instances when it's no longer on any user's watchlist, keeping your libraries clean and optimized.

## Quick Setup

1. Navigate to **Utilities → Delete Sync**
2. Select deletion mode (watchlist-based or tag-based)
3. Choose content types to manage (movies, ended shows, continuing shows)
4. Configure safety threshold and file management options
5. Run a **Dry Run** to preview deletions
6. Enable automatic scheduling or run manually

## Deletion Modes

**Watchlist-based** (default): Removes content when no longer on any synced user's watchlist.

**Tag-based**: Uses removal tags for granular control:
- Adds removal tags when content leaves watchlists
- Configurable tag behavior: keep, remove, or prefix existing tags
- Optional regex filter: require additional tag matching for deletion
- Allows delayed deletion based on tag presence

## Plex Playlist Protection

Protect content from deletion by adding it to designated Plex playlists:
- Automatic playlist creation for all users (default: "Do Not Delete")
- Content in protection playlists is excluded from deletion
- Works with both deletion modes

## Configuration

| Setting | Description |
|---------|-------------|
| **Mode** | Watchlist-based or tag-based deletion |
| **Content Types** | Movies, ended shows, continuing shows |
| **File Management** | Delete or retain media files from disk |
| **Playlist Protection** | Configure protection playlist names |
| **Safety Threshold** | Prevent mass deletion with configurable limits |
| **Scheduling** | Set automatic cleanup timing |
| **Notifications** | Discord, Apprise, or both (optional: notify only on deletion) |

### Tag-Based Options

| Setting | Description |
|---------|-------------|
| **Required Tag Regex** | Optional pattern - content must match to be deleted |
| **Tracked Content Only** | Only delete content tracked in approval system |

## Running Delete Sync

- **Enable Automatic**: Run on configured schedule
- **Run Now**: Manual immediate execution  
- **Dry Run**: Preview deletions without changes

:::info Playlist Creation
Dry runs will create protection playlists if they don't exist - this is safe and doesn't delete content.
:::

<img src={useBaseUrl('/img/Delete-Sync-Dry.png')} alt="Delete Sync Dry Run Notification" />

## Advanced Tag Filtering

The **Required Tag Regex** requires content to have both the removal tag AND a matching tag pattern. Patterns are validated for safety (max 1024 characters, no catastrophic backtracking).

### Use Cases

**Multi-instance deletion sync:**
```
Scenario: Two Pulsarr instances sharing Sonarr/Radarr
Instance 1: Removal prefix = pulsarr1-removed, Regex = pulsarr2-removed
Instance 2: Removal prefix = pulsarr2-removed, Regex = pulsarr1-removed
Result: Content is only deleted when BOTH instances mark it for removal
```

**User-specific deletion:**
```
Pattern: ^pulsarr-user-john$
Result: Only delete content tagged with removal tag AND specific user tag
```

**Category-based deletion:**
```
Pattern: ^genre:(horror|thriller)$
Result: Only delete content with removal tag AND specific genre tags
```

**Exclusion patterns:**
```
Pattern: ^(?!.*protected).*$
Result: Delete content with removal tag UNLESS it has a "protected" tag
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Content not being deleted** | Check deletion mode settings; verify content is off all watchlists; run dry run to preview |
| **Too much content flagged** | Adjust safety threshold; use playlist protection; enable "Tracked Content Only" |
| **Regex not matching** | Test pattern with simple examples; check for valid JavaScript regex syntax |
| **Protected content deleted** | Verify playlist names match exactly; ensure playlists exist for all users |

## Best Practices

- Start with dry runs to understand impact
- Use playlist protection for favorites or seasonal content
- Consider tag-based mode for complex deletion workflows
- Test regex patterns with simple examples before applying broadly
- Use the "Tracked Content Only" option to avoid deleting manually added content
- Keep files for shows that may return

## API Reference

See the [Delete Sync API documentation](/docs/api/dry-run-delete-sync) and [Config API](/docs/api/update-config) for detailed endpoint information.