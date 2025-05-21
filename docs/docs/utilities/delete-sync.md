---
sidebar_position: 1
---

# Delete Sync

Delete Sync automatically removes content from your Sonarr/Radarr instances when it's no longer present on any user's watchlist. This completes the content lifecycle management, ensuring your libraries remain clean and optimized.

## Key Features

- **Advanced Deletion Modes**:
  - **Watchlist-based**: Removes content not present on any user's watchlist (traditional mode)
  - **Tag-based**: Uses removal tags to mark content for deletion with flexible behavior options
- **Plex Playlist Protection**: Protect content from deletion using special playlists
- **File Management**: Option to delete or retain actual media files when removing content
- **Safety Mechanisms**: Built-in protections against accidental mass deletion
- **Scheduling**: Configurable timing for automatic cleanup operations
- **Dry Run Mode**: Preview what would be deleted before committing changes

## Deletion Modes

### Watchlist-Based Deletion (Traditional)
Removes content when it's no longer present on any synced user's watchlist. This is the original deletion method that ensures your library only contains actively watched content.

### Tag-Based Deletion
Works with the user tagging system to provide more granular control:
- Automatically adds removal tags when content is removed from watchlists
- Configurable tag behavior:
  - **Keep tags**: Maintain existing tags for historical tracking
  - **Remove tags**: Clean up all tags upon removal
  - **Add prefix**: Add "removed:" prefix to existing tags
- Allows for delayed deletion based on tag presence

## Plex Playlist Protection

Protect specific content from deletion by adding it to designated Plex playlists:

- **Automatic Playlist Creation**: Protection playlists are automatically created for all users on your Plex server
- **"Do Not Delete" Playlists**: Content in these playlists is automatically excluded from deletion
- **Simple Protection**: Just add any items to the protection playlist, and they'll be excluded from the deletion process
- **Multi-User Support**: Syncs protection playlists across all enabled users
- **Customizable Names**: Configure your own playlist name (default: "Do Not Delete")
- **Works with Both Modes**: Compatible with watchlist and tag-based deletion methods

## Configuration

Navigate to the Utilities page in the Pulsarr web interface and configure your deletion preferences:

- **Mode Selection**: Choose between watchlist-based or tag-based deletion
- **Content Types**: Select which content to delete (movies, ended shows, continuing shows)
- **File Management**: Choose whether to delete associated files from disk
- **Tag Behavior**: Configure how removal tags are handled
- **Playlist Protection**: Set up protected playlist names
- **User Sync Settings**: Control which users' watchlists/playlists affect deletion
- **Notifications**: Configure deletion event notifications
- **Safety Threshold**: Set maximum deletion prevention percentage
- **Scheduling**: Configure timing for automatic cleanup operations
- **Dry Run Mode**: Preview deletions without committing changes

## Running Delete Sync

You can operate Delete Sync in several ways:

1. **Enable Automatic Sync**: Toggle the feature on to run on your configured schedule
2. **Run Now**: Manually trigger the deletion process immediately
3. **Dry Run**: Preview what would be deleted without making any changes

:::info Playlist Creation
When Plex Playlist Protection is enabled, running a dry run will automatically create the protection playlists for all users if they don't already exist. This is a safe operation that only creates the playlists without deleting any content.
:::

You can configure notifications to receive information regarding your workflow:

![Delete Sync Dry](../../static/img/Delete-Sync-Dry.png)

![Delete Sync Error](../../static/img/Delete-Sync-Error.png)

## Safety Features

Delete Sync includes several safety measures to prevent accidental data loss:

- Mass deletion prevention based on configurable thresholds
- Selective content type targeting
- Dry run previews
- Detailed deletion logs
- **Playlist-Based Content Protection**

## Integration with User Tagging

When using tag-based deletion mode, Delete Sync works seamlessly with the User Tagging feature:

1. When content is removed from a watchlist, removal tags are automatically added
2. Content with removal tags can be:
   - Immediately deleted based on your schedule
   - Retained with historical tags for record-keeping
   - Marked with a "removed:" prefix for easy identification
3. Protected content in playlists is excluded regardless of tag status

## Recommendations

- Begin with a dry run to understand the impact on your libraries.
- Consider using playlist protection for seasonal content or favorites.
- Use tag-based mode for more granular control over deletion timing.
- Keep files for ended shows that may return for future seasons.
- Regularly review your protected playlists to ensure they're current.