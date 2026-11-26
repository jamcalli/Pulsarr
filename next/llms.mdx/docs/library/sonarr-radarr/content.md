# Sonarr and Radarr (/library/sonarr-radarr)

Shows go to Sonarr and movies go to Radarr. Manage them under **Library** > **Sonarr** and **Library** > **Radarr**. Both pages work the same way, and the differences are noted below.

## Add an instance [#add-an-instance]

Select **Add instance**, then fill in **Connection**:

- **Name** is shown across Pulsarr, for example in the Content router.
- **URL** is the instance's address, including the port.
- **API key** is in Sonarr or Radarr under Settings > General.

Select **Test connection**. Pulsarr needs a passing test before it can save, and the test also loads the quality profiles, root folders and tags for the next section.

The test also checks that Sonarr or Radarr can reach Pulsarr, which it needs to report finished downloads. If it can't, select **Fix the address** and choose how your servers reach Pulsarr. You can also change that address in the **Webhooks** section of the page. Sonarr and Radarr don't say why a webhook check failed, so look in their own log for the reason. An https address with no port is called on 443, not on Pulsarr's port. Pulsarr adds a secret header to the webhook it creates and rejects calls without it, so there is nothing to set up by hand.

## Where content lands [#where-content-lands]

These settings apply to everything Pulsarr sends to the instance. A Content router route can override **Quality profile**, **Root folder**, **Search on add** and **Tags**, plus **Season monitoring** and **Series type** for Sonarr and **Monitor** for Radarr.

For both:

- **Quality profile** and **Root folder**.
- **Search on add** searches as soon as an item is added.
- **Tags** are added to items that reach the instance because no route matched. A matching route uses its own tags instead.
- **Existing content** decides what a new request does when the title is already on the instance. See [Existing content](#existing-content).

For Sonarr:

- **Season monitoring** picks which episodes to monitor. The rolling options, **Pilot rolling**, **First season rolling** and **All seasons pilot rolling**, start small and monitor more as people watch. They stay disabled until [session monitoring](/library/session-monitoring) is on.
- **Series type** is **Standard**, **Anime** or **Daily**.
- **Monitor new items** decides whether seasons that air later are monitored.
- **Season folders** puts each season in its own folder.

For Radarr:

- **Minimum availability** is **Announced**, **In cinemas** or **Released**.
- **Monitor** is **Movie only**, **Movie and collection** or **None**.

Before sending, Pulsarr checks only the instances the request is routed to. A title already on some other instance is still sent.

**Skip content already on Plex**, under [Plex connection](/system/plex-connection), checks Plex servers, not Sonarr or Radarr. **Servers to check** there sets whether shared servers count, and they only count for the admin's own watchlist.

## Existing content [#existing-content]

With **Existing content** on **Leave as is**, a title already on the instance is left alone and the request is marked as requested. **Reactivate when unmonitored and missing** acts on titles that meet both conditions:

- A movie qualifies when it's unmonitored and has no file.
- A show qualifies when nothing in it is monitored, and either no episode has a file or an aired episode outside the specials is missing its file. A complete show that's unmonitored is left alone.

A new request for a qualifying title is handled like a request for new content. Content router routes, approvals and quotas apply, and the usual notification is sent. Instead of adding the title, Pulsarr applies the request's quality profile, root folder, tags, monitoring and series type or minimum availability to the existing entry. It then searches when **Search on add** is on.

- Tags are added to the entry's tags and never replace them.
- A show that still has some files keeps its root folder.
- A movie is searched only when Radarr reports it available.
- **Movie and collection** monitors the movie only.
- A rolling request gives the show a fresh [session monitoring](/library/session-monitoring) entry, and a request with any other option removes the show's entry.

Things to know:

- It acts only when a title is added to a watchlist. Titles already on a watchlist are never touched.
- An approval from an earlier request for the same title does not carry over. The new request is checked again.
- If the title is on more than one of the instances the request goes to, every copy has to qualify on an instance with this setting on. Otherwise nothing changes.
- A reactivated title gets an approval record like any request, so [delete sync](/library/delete-sync) with **Tracked content only** treats it as requested content.
- With **Skip content already on Plex** on, a title Plex still reports is skipped first.
- [Exclusions](/library/exclusions) are checked first. A title excluded for the user, or for everyone, is skipped before this setting applies.
- A title that has no files but is still monitored does not qualify.

## Behavior [#behavior]

**Bypass ignored** adds content even when it's on the instance's import list exclusions.

Content that no Content router route claims goes to the **Default instance**. There's one default per type, and the first instance you add is always the default.

Only the default instance has these two settings:

- **Synced instances** also receive content that falls back to the default because no route matched, for example to keep a 4K copy. Each synced instance uses its own settings.
- **Skip content no route matches**, when on, skips content that no route claims instead of sending it to the default.

When you add a synced instance, **Copy existing content** sends everything already on the default to it. New content syncs on its own.

## Remove an instance [#remove-an-instance]

The default instance can't be removed while other instances exist. Make another instance the default first.

Removing an instance also deletes the Content router routes that send to it, its place in other instances' synced instances, and Pulsarr's record of which watchlist items are on it. The watchlist items themselves stay. For Sonarr, rolling monitored shows on the instance are removed too.