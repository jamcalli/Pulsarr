# Plex connection (/system/plex-connection)

Find these under **System** > **Plex connection**.

## Plex account [#plex-account]

Pulsarr reads watchlists through the Plex account that owns your server. To link a different account, select **Relink with Plex** and approve Pulsarr on plex.tv, or **Paste a token** if you already have one.

**Unlink** removes the account. Watchlist syncing stops until you link again, and your requests and settings stay.

## Plex server [#plex-server]

**Connection** starts on **Automatic**, which lets Pulsarr pick the best connection to your server. Choose **Address** to enter it yourself. **Test connection** checks it.

**Skip content already on Plex** skips requests for titles already on Plex. **Servers to check** sets where Pulsarr looks, **Your server** or **Your server and shared servers**. Shared servers count only for the admin's own watchlist. If your server can't be checked, Pulsarr holds the request and tries again later instead of sending it.

**Plex live connection** shows whether Pulsarr is getting live updates from your server. While it's down, Pulsarr polls Plex instead.

## Watchlist feeds [#watchlist-feeds]

With Plex Pass, Pulsarr watches two RSS feeds, **Your watchlist feed** and **Friends' watchlist feed**, so new watchlist items arrive within seconds. Without Plex Pass, Pulsarr checks each watchlist about every five minutes. **Generate feeds** asks Plex for the feed URLs. **Generate again** asks for new ones and replaces the old ones.

**Sync watchlists** reads your and your friends' watchlists from Plex again.

## Plex library refresh [#plex-library-refresh]

Sonarr and Radarr can tell Plex to refresh its library after they import something. **Set up** adds that Plex Media Server connection to every Sonarr and Radarr instance, and **Remove** takes it off all of them, including ones added by hand.

The Plex connection Pulsarr adds uses the host, port and SSL setting of your **Address**, or of the connection **Automatic** picked. An address without a port gets 443 with SSL and 80 without.
