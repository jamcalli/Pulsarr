# Troubleshooting (/installation/troubleshooting)

## Discord direct messages don't arrive [#discord-direct-messages-dont-arrive]

The bot won't start until **Message Content Intent** is turned on for it in the Discord developer portal. A user gets direct messages only with a **Discord user ID** saved on their page and their **Discord** switch on. Discord refuses the message when the user has turned off direct messages from server members in their privacy settings.

## Plex live connection shows Polling [#plex-live-connection-shows-polling]

With **Automatic**, Pulsarr uses the connections plex.tv lists for your server, and none of them may be reachable from where Pulsarr runs. Under **System** > **Plex connection**, choose **Address**, enter one Pulsarr can reach, and select **Test connection**.

## Plex mobile notifications are missing or doubled [#plex-mobile-notifications-are-missing-or-doubled]

Plex mobile notifications need Plex Pass on the server, and users need notifications turned on in the Plex app. Doubles come from the Plex app's own new content notifications, which users turn off per library in the app. See [Plex mobile](/notifications/plex-mobile).

## Apprise shows as not reachable [#apprise-shows-as-not-reachable]

Pulsarr checks the Apprise server only while it starts. Start Apprise first, or restart Pulsarr once Apprise is up. In the same Compose file, `appriseUrl` uses the container name and port, for example `http://apprise:8000`.

## A webhook doesn't fire or its test fails [#a-webhook-doesnt-fire-or-its-test-fails]

The endpoint must answer with a 2xx status. Deliveries are retried only after a timeout, a network error, a 5xx or a 429, and a test is sent once with no retry. HTTPS endpoints need a trusted certificate, so a self-signed one fails.

## Labels or tags don't appear [#labels-or-tags-dont-appear]

Labels and user tags apply only to items on a user's watchlist. Labels need the Plex connection and appear once the item is in Plex. User tags apply when watchlists sync, or straight away with **Sync tags**.

## Tag labels don't appear on some items [#tag-labels-dont-appear-on-some-items]

**Sync tags as labels** pairs each Plex item with its Sonarr or Radarr entry by path. A movie needs the exact same file path in Plex and Radarr. A show matches on its folder path, or failing that on the folder name alone. Give the Plex and arr containers identical path mappings.

## Delete sync removed protected content [#delete-sync-removed-protected-content]

**Playlist protection** matches the **Playlist name** exactly, including case, in each user's own Plex account. Items in a playlist with any other spelling aren't protected.

## Saving settings returns 403 [#saving-settings-returns-403]

The request reached Pulsarr from a different origin than the page. Either the reverse proxy rewrites the `Host` header, or the page is served from another site. Keep the original `Host` or send `X-Forwarded-Host`, or list the site in `allowedOrigins`. See [Reverse proxy](/installation/environment-variables#reverse-proxy).

## Sign-in never prompts or rate limits trip behind a reverse proxy [#sign-in-never-prompts-or-rate-limits-trip-behind-a-reverse-proxy]

The proxy isn't sending `X-Forwarded-For`, so every visitor shares the proxy's address. See [Reverse proxy](/installation/environment-variables#reverse-proxy).

## The PostgreSQL migration fails [#the-postgresql-migration-fails]

On PostgreSQL 15 and later, create the database with `OWNER` instead of granting privileges on it. Create the tables before copying the data. The copy refuses tables that already have rows, so after a failed run recreate the database and start from the table step. See [PostgreSQL](/installation/postgresql#move-from-sqlite).

## The API returns 401 [#the-api-returns-401]

Send the key in the `X-API-Key` header, exactly as copied. A revoked key always gets a 401.
