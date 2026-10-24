# Plex connection (/system/plex-connection)

**System** > **Plex connection** holds what you set up in the first two steps of setup, plus a few things you only need later.

## Plex account [#plex-account]

Pulsarr reads watchlists through the Plex account that owns your server. To link a different account, select **Relink with Plex** and approve Pulsarr on plex.tv, or **Paste a token** if you already have one.

**Unlink** removes the account. Watchlist syncing stops until you link again, and your requests and settings stay.

## Plex server [#plex-server]

**Connection** starts on **Automatic**, which lets Pulsarr pick the best connection to your server. Choose **Address** to enter it yourself. **Test connection** checks it.

**Skip content already on Plex** skips requests for titles your server or a shared server already has.

**Plex live connection** shows whether Pulsarr is getting live updates from your server. While it's down, Pulsarr polls Plex instead.

## Watchlist feeds [#watchlist-feeds]

With Plex Pass, Pulsarr watches two RSS feeds, **Your watchlist feed** and **Friends' watchlist feed**, so new watchlist items arrive within seconds. Without Plex Pass, Pulsarr checks each watchlist on a schedule. **Generate feeds again** asks Plex for new feed URLs and replaces the old ones.

**Sync watchlists** reads your and your friends' watchlists from Plex again.

## Plex library refresh [#plex-library-refresh]

Sonarr and Radarr can tell Plex to refresh its library after they import something. **Set up** adds that Plex Media Server connection to every Sonarr and Radarr instance, and **Remove** takes it off all of them, including ones added by hand.
