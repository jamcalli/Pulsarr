# Plex labels (/users/plex-labels)

Plex labels mark each movie and show in Plex with the users who have it on their watchlist. Set them up under **Users** > **Plex labels**.

## Labeling [#labeling]

**Label content in Plex** labels each item with who watchlists it, once the item is in Plex. A label is the **Prefix** and the user's name, for example `pulsarr:jamie`. **Name from** picks **Username** or **Alias**. Labels also apply when Sonarr or Radarr reports an import to Pulsarr.

The format can't change while Pulsarr's labels exist. Remove them first with **Remove all Pulsarr labels**.

## When something leaves a watchlist [#when-something-leaves-a-watchlist]

**Label behavior** decides what happens to a user's label when they remove the item:

- **Remove the label** removes it.
- **Keep the label** keeps it as a record of who asked.
- **Swap for a removed label** replaces it with the **Removed label** once nobody wants the item, so you can find it.

**Clean up orphaned labels on sync** removes labels for users who were deleted, renamed or stopped syncing. **Reset labels before each sync** applies the rule above to leftover labels before each sync. Turn it on after you move away from **Keep the label**.

## Tag sync [#tag-sync]

**Sync tags as labels** copies Sonarr and Radarr tags to Plex as labels, except user tags. Pulsarr pairs a Plex item with its Sonarr or Radarr entry by file path, so Plex and the arrs must see the media under the same paths. Each tag on an item becomes a label on it, with the same prefix. **Radarr tags on movies** and **Sonarr tags on shows** pick which ones.

## Full sync [#full-sync]

**Full sync** rechecks every watchlisted item and fixes its labels. It needs labeling on. **Run on a schedule** runs it at the time and, if you like, the day of the week set in **Run at**, in the server's time zone.

## Remove labels [#remove-labels]

**Clean up orphaned labels** deletes labels of removed, renamed or non-syncing users. **Remove all Pulsarr labels** strips every label Pulsarr added, user and tag labels alike. Other labels and your content aren't touched.
