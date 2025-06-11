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

## Best Practices

- Start with dry runs to understand impact
- Use playlist protection for favorites or seasonal content  
- Consider tag-based mode for complex deletion workflows
- Keep files for shows that may return