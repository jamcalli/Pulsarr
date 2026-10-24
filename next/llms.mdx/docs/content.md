# Welcome to Pulsarr (/)

## Introduction [#introduction]

Pulsarr watches your Plex watchlist and the watchlists of your Plex friends. When a movie or show is added, Pulsarr sends it to Radarr or Sonarr. When it's available, Pulsarr can notify the person who added it through Discord, Plex mobile push, Apprise or webhooks. Your users request content from the Plex app they already use, with no extra account.

:::info
Pulsarr can only read the watchlist of someone who is a friend of your Plex account. People with access to your server who aren't friends yet show up under **Not yet friends** on the **Plex users** page, where you can send them a friend request.
:::

With Plex Pass, watchlist changes arrive within seconds. Without it, Pulsarr checks each watchlist on a schedule.

The Content router decides which Sonarr or Radarr instance each title goes to, with which quality profile and root folder. Approvals and quotas let you control what gets added.

![The Pulsarr home page](/img/home.webp)

Pulsarr runs in Docker or as a native install on Linux, macOS and Windows, and stores its data in SQLite or PostgreSQL.

## First time? [#first-time]

<Cards>
  <Card title="How Pulsarr works" href="/how-it-works" description="What happens between a watchlist add and the notification that it's ready." />
  <Card title="Quick start" href="/installation/quick-start" description="From installing Pulsarr to your first watchlist item reaching Sonarr or Radarr." />
  <Card title="Installation" href="/installation" description="Docker and the native installers for Linux, macOS and Windows, plus the Unraid and TrueNAS app catalogs." />
</Cards>

## Getting help [#getting-help]

If you need help, ask in [our Discord](https://discord.gg/9csTEJn5cR).

Only use [the issue tracker](https://github.com/jamcalli/pulsarr/issues) if you've found a bug or have a specific feature request.

These docs are [maintained on GitHub](https://github.com/jamcalli/pulsarr/tree/master/docs). To suggest an improvement, open an issue or pull request.
