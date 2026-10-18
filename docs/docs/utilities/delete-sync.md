import useBaseUrl from '@docusaurus/useBaseUrl';

# Delete Sync

Automatically removes content from Sonarr/Radarr instances when it's no longer on any user's watchlist, keeping your libraries clean and optimized.

## Quick Setup

1. Open **Library**, then **Delete sync**
2. Select deletion mode (watchlist-based or tag-based)
3. Choose content types to manage (movies, ended shows, continuing shows)
4. Configure safety threshold and file management options
5. Run a **Dry run** to preview deletions
6. Turn on the schedule or run it manually

## Deletion Modes

**Watchlist-based** (default): Removes content when no longer on any user's watchlist. With **Respect user sync settings** on, only the watchlists of users with sync enabled protect content.

**Tag-based**: Uses removal tags for granular control:
- Deletes content carrying the removal tag set on **User tags** (matching ignores case)
- User tags only adds that tag when its removal behavior is "Swap for a removed tag"
- An optional required tag pattern makes deletion also need a matching tag (tag mode only)
- Allows delayed deletion based on tag presence

## Plex Playlist Protection

Protect content from deletion by adding it to designated Plex playlists:
- Every run with protection on, dry or real, creates the playlist for Plex users who lack it (default: "Do Not Delete")
- Content in protection playlists is excluded from deletion
- Works with both deletion modes

## Configuration

| Setting | Description |
|---------|-------------|
| **Mode** | Watchlist-based or tag-based deletion |
| **Content Types** | Movies, ended shows, continuing shows. Continuing shows are any shows Sonarr does not mark as ended |
| **File Management** | Delete or retain media files from disk |
| **Playlist Protection** | Configure protection playlist names |
| **Safety Threshold** | Prevent mass deletion with configurable limits |
| **Scheduling** | Set automatic cleanup timing |
| **Tracked Content Only** | Only delete content requested through Pulsarr, in both modes |
| **Notifications** | Where each run's summary goes, dry runs included. **Only when something was deleted** skips summaries for runs that delete nothing, dry runs too |

### Tag-Based Options

| Setting | Description |
|---------|-------------|
| **Required Tag Pattern** | Optional regex. Content must also carry a tag matching it to be deleted |

## Running Delete Sync

- **Run on a schedule**: Run at the chosen day and time
- **Run now**: Run once immediately with the saved settings
- **Dry run**: Preview deletions without changes. The result shows on the page with per-type totals, and **View items** lists every movie and show that would be deleted

A dry run still refreshes watchlists.

<img src={useBaseUrl('/img/Delete-Sync-Dry.png')} alt="Delete Sync Dry Run Notification" />

## Advanced Tag Filtering

The **Required Tag Pattern** requires content to have both the removal tag AND a matching tag pattern. Patterns are validated for safety (max 1024 characters, no catastrophic backtracking).

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