# Delete sync (/library/delete-sync)

Delete sync removes content from Sonarr and Radarr when nobody wants it anymore. Set it up under **Library** > **Delete sync**. It deletes nothing until you run it or turn on its schedule, and a dry run shows what it would delete first.

## Mode [#mode]

**Decide by** sets what counts as no longer wanted:

- **Watchlist based** deletes anything that isn't on any user's watchlist.
- **Tag based** deletes anything carrying the **Removal tag**, which comes from [User tags](/users/user-tags). Matching ignores case. **Required tag pattern** is an optional regular expression, and when set, content also needs a tag that matches it. Patterns use JavaScript syntax, are limited to 1024 characters, and a backtracking check rejects unsafe ones.

Either way, a title [excluded](/library/exclusions) for all its watchlisters, or for everyone, counts as unwanted. In tag based mode it doesn't need the removal tag.

## What may be deleted [#what-may-be-deleted]

Nothing outside these choices is deleted:

- **Delete movies** removes movies from Radarr.
- **Delete ended shows** removes shows Sonarr marks as ended.
- **Delete continuing shows** removes every other show.
- **Delete files** also deletes the media files from disk. It's on by default.
- **Clean up approval records** removes approval records for deleted content and content already gone.

## What protects content [#what-protects-content]

Anything a guard covers is skipped:

- **Respect user sync settings** counts only the watchlists of users with sync on.
- **Tracked content only** limits deletion to content requested through Pulsarr.
- **Playlist protection** skips anything in a Plex playlist named exactly the **Playlist name**, in any user's account. Each run creates the playlist for users who don't have it yet.
- **Max deletion** aborts a run that would delete more than this percentage of eligible items, meaning items of the types chosen under **What may be deleted**.

## Runs and schedule [#runs-and-schedule]

Select **Dry run** to preview a run without deleting anything. A dry run still refreshes watchlists and sends notifications. The result shows how much it would delete of each type, and lists every title.

**Run now** runs once with the saved settings. **Run on a schedule** runs it at the **Day and time** you choose. Deleting can't be undone, so do a dry run first.

## Notifications [#notifications]

**Send the run summary to** picks where each run's summary goes, dry runs included. **Only when something was deleted** skips the summary when a run deletes nothing.
