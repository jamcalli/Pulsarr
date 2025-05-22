---
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Discord Notifications

Pulsarr includes a powerful Discord integration that enables personalized notifications and user-friendly configuration options.

## Overview

The Discord integration consists of two main components:

1. **Discord Bot**: Handles user interactions and delivers direct message notifications
2. **Discord Webhooks**: Sends administrative notifications about content activity

This dual approach provides flexibility in how notifications are delivered and configured.

## Setting Up Webhooks

The webhook endpoint can be used without creating a Discord bot. This is ideal for sending administrative notifications to a specific channel.

### Webhook Configuration

1. In your Discord server, create a channel for Pulsarr notifications
2. Click the gear icon beside the channel name → Integrations → Webhooks → New Webhook
3. Name the webhook "Pulsarr Notifications" and copy the webhook URL
4. Add the webhook URL to your Pulsarr configuration

You will receive notifications like this:

<img src={useBaseUrl('/img/Webhook-grab.png')} width="400" alt="Webhook Grab" />

### Multiple Webhooks

You can configure multiple Discord webhook URLs by separating them with commas. This allows you to send notifications to multiple channels or servers simultaneously.

```
https://discord.com/api/webhooks/id1/token1,https://discord.com/api/webhooks/id2/token2
```

## Setting Up the Discord Bot

For personalized user notifications, you'll need to set up a Discord bot.

### Creating a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name (e.g., "Pulsarr")
3. Provide an icon - here's one you can use:

<img src={useBaseUrl('/img/pulsarr-lg.png')} width="150" alt="Pulsarr Logo" />

4. Go to the "Bot" section and click "Add Bot"
5. Under "Privileged Gateway Intents", enable "Message Content Intent"
6. Save changes and copy the bot token - you'll need this for Pulsarr

### Configuring Bot Permissions

1. Go to OAuth2 → URL Generator
2. Under "Scopes", select "bot" and "applications.commands"
3. Under "Bot Permissions", select at minimum:
   - Send Messages
   - Embed Links
   - Use Slash Commands
   - Send Messages in Threads
   - Use External Emojis
4. Copy the generated URL

### Inviting the Bot to Your Server

1. Paste the URL you copied into a browser
2. Select your Discord server from the dropdown
3. Authorize the permissions

### Configuring Pulsarr Discord Bot

In your Pulsarr web interface:

1. Navigate to the Discord settings section
2. Enter the Bot Token (from step 6 above)
3. Enter the Client ID (found in the "General Information" tab of your Discord application)
4. Enter the Guild ID (your Discord server ID - enable Developer Mode in Discord settings, then right-click your server and "Copy ID")
5. Click the 'Start' button next to the Discord Bot Settings header

## User Notification Setup

Once your bot is configured, users can set up their own notifications:

1. Users type `/notifications` command in your Discord server
2. They'll be prompted to enter their Plex username to create the association

<img src={useBaseUrl('/img/Discord-Signup.png')} width="400" alt="Discord Signup" />

3. Users can configure their notification preferences. These can be accessed anytime using the `/notifications` command.

<img src={useBaseUrl('/img/Discord-Settings.png')} width="400" alt="Discord Settings" />

<img src={useBaseUrl('/img/Discord-Edit-Modal.png')} width="400" alt="Discord Edit Modal" />

:::note
The system uses the actual Plex username for the primary token user. When setting notification preferences, users should use their Plex username.
:::

## Notification Examples

When content is available, users will receive DMs like these:

<img src={useBaseUrl('/img/DM-New-Epp.png')} width="400" alt="DM New Episode" />

<img src={useBaseUrl('/img/DM-Season.png')} width="400" alt="DM Season" />

## Troubleshooting

### Bot Not Responding to Commands

If your bot isn't responding to commands:

1. Verify the bot token is correct
2. Ensure the Message Content Intent is enabled
3. Check that the bot has the necessary permissions in your server
4. Confirm the Guild ID is correct
5. Look at the Pulsarr logs for any discord-related errors

### Users Not Receiving Notifications

If users aren't receiving notifications:

1. Ensure they have associated their Plex username correctly
2. Check if they have enabled notifications in their settings
3. Verify their Plex account has sync permissions enabled in Pulsarr
4. Check if their Discord privacy settings allow DMs from server members