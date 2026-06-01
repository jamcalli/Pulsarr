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
