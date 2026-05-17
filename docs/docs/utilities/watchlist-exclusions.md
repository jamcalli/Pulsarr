# Watchlist Exclusions

Exclude specific items from watchlist sync to prevent re-request loops when Delete Sync removes content that users still have on their Plex watchlists.

## Quick Setup

1. Navigate to **Utilities → Exclusions**
2. Find the item you want to exclude using search or filters
3. Click **Exclude** to skip the item during sync
4. Click **Unexclude** to restore normal sync behavior

## How It Works

1. **Delete Sync removes content** from Sonarr/Radarr, but the item stays on a user's Plex watchlist
2. **Without exclusions**, the next sync cycle would re-request it — creating an infinite loop
3. **With exclusions**, the sync engine skips excluded items entirely
4. **Automatic cleanup** — exclusions clear when the user removes the item from their Plex watchlist, so re-adding it later works normally

## Configuration

The Exclusions page shows all users' watchlist items in a sortable, filterable table:

| Feature | Description |
|---------|-------------|
| **Search** | Filter items by title |
| **User Filter** | Show items for specific users |
| **Type Filter** | Filter by Movie or Show |
| **Sorting** | Sort by title, status, or date added (default: newest first) |

## Best Practices

- Prefer excluding over asking users to remove items from their watchlists
- Exclusions are per-user — the same title can be excluded for one user but active for another

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Item still being requested** | Verify the exclusion exists for the correct user; check sync engine logs |
| **Exclusion disappeared** | User likely removed the item from their Plex watchlist, which clears exclusions automatically |
| **Item not showing in table** | Item may not be on any user's watchlist; check Plex watchlist status |

## API Reference

See the [Exclusions API documentation](/docs/api/exclusions) for detailed endpoint information.
