# Delivery (/notifications/delivery)

These settings apply to every notification channel. Find them under **Notifications** > **Delivery**.

## Episode grouping [#episode-grouping]

When several episodes of a show arrive close together, Pulsarr sends one notification instead of one per episode.

- **Queue wait time** is how long Pulsarr waits to collect episodes before it sends.
- **New episode threshold** is how recently an episode must have aired to skip the wait and notify straight away. Older episodes, such as a back catalog being imported, are grouped.

## Admin notifications [#admin-notifications]

These pick where notices for admins go. The choices are **All channels**, **Apprise only**, **Discord webhook and direct messages**, **Discord direct messages only**, **Discord webhook only** and **None**.

- **Watchlist additions** tells you when a user adds something.
- **Update notifications** tells you when a new Pulsarr release comes out. Pulsarr never updates itself.

Webhook delivery uses the [Discord](/notifications/discord) admin webhooks, and Apprise uses the [Apprise](/notifications/apprise) system notifications. Direct messages need the Discord bot and a **Discord user ID** saved on the server owner's Plex user, otherwise they are dropped without an error.

## User notifications [#user-notifications]

**Availability notifications** decides whether users are told when something they asked for is ready. Each user still picks their own channels on their page under [Plex users](/users/plex-users).
