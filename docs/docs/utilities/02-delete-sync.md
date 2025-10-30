---
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Delete Sync

Automatically removes content from Sonarr/Radarr instances when it's no longer on any user's watchlist, keeping your libraries clean and optimized.

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

Navigate to **Utilities → Delete Sync**:

- **Mode**: Choose watchlist-based or tag-based deletion
- **Content Types**: Select movies, ended shows, continuing shows
- **File Management**: Delete or retain media files from disk
- **Playlist Protection**: Configure protection playlist names
- **Tag-Based Options** (when using tag-based mode):
  - **Required Tag Regex**: Optional regex pattern - content must match this pattern to be deleted (in addition to having removal tag)
  - **Tracked Content Only**: Only delete content tracked in Pulsarr's approval system
- **Notifications**: Choose Discord, Apprise, or both
  - **Notify Only on Deletion**: Reduce noise by only notifying when items are actually deleted
- **Safety Threshold**: Prevent mass deletion with configurable limits
- **Scheduling**: Set automatic cleanup timing

## Running Delete Sync

- **Enable Automatic**: Run on configured schedule
- **Run Now**: Manual immediate execution  
- **Dry Run**: Preview deletions without changes

:::info Playlist Creation
Dry runs will create protection playlists if they don't exist - this is safe and doesn't delete content.
:::

## Safety Features

- Mass deletion prevention with configurable thresholds
- Dry run previews
- Selective content targeting
- Playlist-based protection
- Detailed logging

<img src={useBaseUrl('/img/Delete-Sync-Dry.png')} alt="Delete Sync Dry Run Notification" />

## Integration with User Tagging

Tag-based mode works with User Tagging:
- Removal tags added automatically when content leaves watchlists
- Tags can be kept for history, removed, or prefixed
- Protected playlist content excluded regardless of tags

## Advanced Tag Filtering

The **Required Tag Regex** option provides an additional layer of control for tag-based deletion. When configured:

- Content must have **both** the removal tag AND a tag matching the regex pattern to be deleted
- If no regex is configured, only the removal tag is required
- Regex patterns are validated for safety to prevent catastrophic backtracking
- Maximum pattern length: 1024 characters

### Use Cases

**Multi-instance deletion sync:**
```
Scenario: Two Pulsarr instances sharing Sonarr/Radarr
Instance 1: Removal prefix = pulsarr1:removed, Regex = pulsarr2:removed
Instance 2: Removal prefix = pulsarr2:removed, Regex = pulsarr1:removed
Result: Content is only deleted when BOTH instances mark it for removal
```

**User-specific deletion:**
```
Pattern: ^pulsarr:user:john$
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

### Safety Features

All regex patterns are validated for:
- Valid JavaScript regex syntax
- Unicode mode compatibility
- Safe execution (no catastrophic backtracking patterns)

## Best Practices

- Start with dry runs to understand impact
- Use playlist protection for favorites or seasonal content
- Consider tag-based mode for complex deletion workflows
- Test regex patterns with simple examples before applying broadly
- Use the "Tracked Content Only" option to avoid deleting manually added content
- Keep files for shows that may return

## API Reference

See the [Delete Sync API documentation](/docs/api/dry-run-delete-sync) and [Config API](/docs/api/update-config) for detailed endpoint information.