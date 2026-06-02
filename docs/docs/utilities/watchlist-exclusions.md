import useBaseUrl from '@docusaurus/useBaseUrl';

# Watchlist Exclusions

Prevent specific watchlist items from being routed to Sonarr and Radarr, allowing you to control which content gets added to your library.

## Quick Setup

1. Navigate to **Utilities → Watchlist Exclusions**
2. Find the item you want to exclude using search or filters
3. Click **Exclude** on the item to block it from being added to Sonarr/Radarr
4. Click **Unexclude** to unblock it

<img src={useBaseUrl('/img/Watchlist-Exclusions.png')} alt="Watchlist Exclusions Interface" />

## How It Works

When a user adds something to their Plex watchlist, the sync engine normally routes it to Sonarr or Radarr. An exclusion is a per-user veto on that routing for a specific item — the sync engine sees the item, checks for an exclusion, and skips it if one exists.

Common reasons to use this:

- **You don't want a title auto-requested** even though a user has it watchlisted (e.g. content you've chosen not to host)
- **Prevent re-request loops after Delete Sync** — when content is removed but stays on a user's watchlist, an exclusion stops the next sync from re-requesting it

Exclusions clear automatically when the user removes the item from their Plex watchlist, so re-adding it later works normally.

:::info Interaction with Delete Sync
Excluded items are treated as unwatchlisted by Delete Sync. If you exclude something that's already in Sonarr/Radarr, the next Delete Sync run will remove it from your library.
:::

## Page Features

The Watchlist Exclusions page shows all users' watchlist items in a sortable, filterable table:

| Feature | Description |
|---------|-------------|
| **Search** | Filter items by title |
| **User Filter** | Show items for specific users |
| **Type Filter** | Filter by Movie or Show |
| **Sorting** | Sort by title, status, or date added (default: newest first) |

## Best Practices

- Prefer excluding over asking users to remove items from their watchlists — the exclusion approach lets the item stay watchlisted (so they can still see it in Plex) without triggering a request
- Exclusions are per-user. If you want to block something across everyone, you'll need to exclude it for each user

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Item still being requested** | Verify the exclusion exists for the correct user; check sync engine logs |
| **Exclusion disappeared** | User likely removed the item from their Plex watchlist, which clears exclusions automatically |
| **Item not showing in table** | Item may not be on any user's watchlist; check Plex watchlist status |

## API Reference

See the [Watchlist Exclusions API documentation](/docs/api/watchlist-exclusions) for detailed endpoint information.
