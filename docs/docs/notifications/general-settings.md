---
sidebar_position: 1
---

# General Settings

Cross-channel notification options that apply regardless of which delivery method you use. Configure these under **Notifications → General Settings**.

## Queue Wait Time

How long Pulsarr waits before sending queued notifications, in minutes. Batching groups multiple episodes of the same show into a single notification instead of one alert per episode. Default: **2 minutes**.

## New Episode Threshold

How recently an episode must have aired to skip the queue and notify immediately, in hours. Episodes aired within this window send right away; older ones (such as a back-catalog season import) are batched using the Queue Wait Time above. Default: **48 hours**.

## Update Notifications

Sends an out-of-app notification when a new Pulsarr release is detected on GitHub. Pulsarr checks hourly and notifies once per version. The in-app version label also shows a popover with the release name, date, and notes when an update is available.

:::note
This is a heads-up only. Pulsarr is never upgraded automatically.
:::

Choose which channels deliver the alert:

| Option | Sends via |
| ------ | --------- |
| None | Off (default). In-app popover still shows. |
| All Channels | Discord webhook + Discord bot DM + Apprise |
| Apprise Only | [System Apprise URL](./apprise.md#system-apprise-url) |
| Discord (Webhook + DM) | Discord webhook and bot DM |
| Discord (DM Only) | Discord bot DM to the primary user |
| Discord (Webhook Only) | [Discord webhook](./discord.md#setting-up-webhooks) |

Webhook delivery requires a configured [Discord webhook URL](./discord.md#setting-up-webhooks). DM delivery requires the [Discord bot](./discord.md#setting-up-the-discord-bot) running with the primary user's Discord account linked. Apprise delivery requires a configured System Apprise URL.

## Quiet Hours & Digests

Controls when users receive their "now available" notifications (Discord DM, Apprise, Plex mobile). Both are off by default, so notifications go out immediately. Admin notifications (approvals, update alerts, delete sync), public channel notifications and native webhooks are never delayed.

The settings here are defaults. Each user can override any of them under **Plex → Users → Edit** (leave a field on **Default** to inherit).

### Batching

| Option | Behaviour |
| ------ | --------- |
| Off | Send each notification immediately (default). |
| Batch window | Hold notifications for N minutes after the first one arrives, then send them together. |
| Daily digest | Hold everything and send one digest at a fixed time each day. |

Batched notifications are combined per user into one message:

- Episodes of the same show collapse into a range (`Show X: S02E01–E08`). A season pack, or a season with many scattered episodes, is shown as `Season 2`.
- Several titles become one digest listing each title.
- A single held notification is sent exactly as it would have been.

Plex mobile pushes always point at one library item, so they cannot list several titles. Instead each title gets one push: the episode, the season (several episodes of one season), or the show (episodes across seasons).

### Quiet Hours

Notifications that would be delivered between **From** and **Until** are held and sent as one digest when quiet hours end. Windows may cross midnight (for example 22:00–07:00). A batch that would land inside quiet hours is also pushed to their end.

### Time Zone

Quiet hours and digest times are wall-clock times in this IANA zone (for example `America/New_York`). Leave it empty to use the server's `TZ` setting. Daylight saving changes are handled: a time skipped by the spring-forward change resolves to the moment the clock jumps.

### Delivery guarantees

Held notifications are stored in the database, so they survive a restart and are delivered once due. Duplicate webhooks for something already held are ignored, exactly as for immediate notifications. If Pulsarr stops in the middle of sending a digest, that digest is not resent on restart, so a user never receives the same digest twice.
