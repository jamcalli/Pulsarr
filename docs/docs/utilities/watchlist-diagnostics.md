# Watchlist Diagnostics

Answer "why didn't this get added?" for one user in a single click. Diagnostics fetches the user's live Plex watchlist, compares it with what Pulsarr has stored and routed, and gives every item a plain-language reason.

## Quick Setup

1. Navigate to **Utilities → Watchlist Diagnostics**
2. Pick a user
3. Click **Run diagnostics**

## What It Shows

Each item gets a **state**, where it was found, and a reason:

| State | Meaning |
|-------|---------|
| **Routed** | In at least one Radarr/Sonarr instance, with its status there |
| **Not seen yet** | On Plex but not stored by Pulsarr yet - shows when the next full reconciliation runs |
| **Removed from Plex** | Stored by Pulsarr but no longer on the Plex watchlist - dropped at the next full reconciliation |
| **Excluded** / **Excluded (global)** | Blocked by a [watchlist exclusion](./watchlist-exclusions) |
| **Missing IDs** | No TMDB ID (movies) or TVDB ID (shows) in the Plex metadata, so the item can't be added - common for specials, webisodes and unmatched items |
| **Awaiting approval** / **Rejected** / **Approval expired** | Held by the [approval system](../features/approval-and-quota-system), including the router rule or quota that triggered it |
| **Approved, not added** | Approved but not on any instance yet |
| **Sync disabled** | The user's sync is turned off on the Plex Users page |
| **Watchlist cap** | The user is over their watchlist cap for that content type |
| **Unsupported type** | Plex reports something other than a movie or show |
| **Not routed** | Stored, valid and not blocked by anything above - a router rule may have skipped it, no rule matched, or adding it failed. Check the logs for the title |

The table opens filtered to items that need attention; switch the filter to **All items** to see everything.

## Safety

- **Read-only.** A run never writes to the database, never contacts Radarr or Sonarr, and never routes anything.
- **Polite to Plex.** It uses the same endpoints, page size and pause between pages as the regular sync, runs only when you click, allows one run at a time, and allows one run per user per minute.
- **Bounded.** At most 1,000 items are fetched from Plex. On longer watchlists, stored items past that point are marked **Not checked** and explained from Pulsarr's data only. Closing the page stops the fetch.
