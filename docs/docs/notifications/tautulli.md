---
sidebar_position: 3
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Tautulli Notifications

Tautulli integration enables native Plex notifications for your users when their watchlist items become available. This provides a seamless notification experience within the Plex ecosystem, leveraging Tautulli's powerful notification agent system.

## Overview

The Tautulli integration creates and manages notification agents for each Plex user, sending native push notifications through the Plex mobile app when content from their watchlist is added to your media server.

:::note Plex Pass Required
This feature requires an active Plex Pass subscription to access RSS feeds and send notifications through Plex's notification system.
:::

## How It Works

### Notification Flow

1. **Content Added**: When new content is added to Radarr/Sonarr, Pulsarr checks if it matches any user's watchlist
2. **Queue Notification**: Matching content triggers a notification to be queued for interested users
3. **Tautulli Polling**: Pulsarr polls Tautulli every 30 seconds to check if the content has appeared in your Plex library
4. **Send Notification**: Once the content is detected in Tautulli's recently added items, notifications are sent to users
5. **Native Delivery**: Users receive push notifications through their Plex mobile app

### Key Features

- **Automatic Agent Management**: Creates and manages Tautulli notification agents for each user
- **Smart Matching**: Uses multiple strategies to match content (Plex keys, GUIDs, metadata)
- **Retry Logic**: Polls for up to 10 minutes with automatic retry on failures
- **Episode Grouping**: When multiple episodes are added, sends season notifications for better user experience
- **User Control**: Each user can enable/disable Tautulli notifications individually

## Setup

### 1. Prerequisites

- Active Plex Pass subscription
- Tautulli installed and configured with your Plex server
- Generated RSS feeds in Pulsarr (Settings → Plex → Generate RSS Feeds)

### 2. Configure Tautulli

1. Navigate to **Settings** → **Notifications** in Pulsarr
2. Enable **Tautulli Notifications**
3. Enter your Tautulli configuration:
   - **Tautulli URL**: Full URL to your Tautulli instance (e.g., `http://192.168.1.100:8181`)
   - **API Key**: Found in Tautulli Settings → Web Interface → API Key
4. Click the **Test Connection** button
5. Save your settings

### 3. Sync User Notifiers

After configuring Tautulli:

1. Click **Sync Notifiers** to create notification agents for all eligible users
2. The system will create a "Pulsarr - Username" agent for each user
3. Users with existing agents will be automatically linked

### 4. Enable for Users

Users can be configured in two ways:

**Individual User Settings:**
1. Go to **Settings** → **Plex** → **User Management**
2. Click edit on a user
3. Toggle **Tautulli Notifications** on/off

**Bulk Updates:**
1. Select multiple users in the user table
2. Click **Bulk Edit**
3. Set Tautulli notification preference for all selected users

## User Experience

### Mobile Push Notifications

Tautulli notifications are delivered directly to users' **Plex mobile apps** (iOS and Android) as native push notifications. This provides the most seamless notification experience within the Plex ecosystem.

:::info Push Notification Setup Required
Users must have push notifications enabled in their Plex mobile app to receive Tautulli notifications. This is a one-time setup per device.
:::

**For iOS Users:**
1. Open the **Plex mobile app**
2. Go to **Settings** → **Notifications**
3. Enable **Push Notifications**
4. Allow notifications when prompted by iOS

**For Android Users:**
1. Open the **Plex mobile app**
2. Go to **Settings** → **Notifications**
3. Enable **Push Notifications**
4. Ensure Plex app notifications are allowed in Android system settings

### Notification Examples

When enabled, users will receive notifications like:

- **Movies**: "Your watchlist item 'Movie Title' has been added to the library"
- **TV Shows**: "New episode of 'Show Title' available! Season X Episode Y has been added"
- **Seasons**: "New season of 'Show Title' available! Multiple episodes have been added"

Notifications appear as native Plex push notifications on mobile devices with:
- Movie/show poster artwork
- Tap action to open content in Plex
- Clear, concise messaging

## Troubleshooting

### No Notifications Received

1. **Verify Plex Pass**: Ensure you have an active Plex Pass subscription
2. **Check RSS Feeds**: Generate RSS feeds in Plex settings if not already done
3. **Test Connection**: Re-test Tautulli connection in settings
4. **User Settings**: Confirm the user has Tautulli notifications enabled
5. **Mobile App Setup**: Ensure users have:
   - Plex mobile app installed (iOS/Android)
   - Push notifications enabled in the Plex app settings
   - System-level notifications allowed for the Plex app
   - Signed in to the same Plex account

### Delayed Notifications

- Pulsarr polls Tautulli every 30 seconds after content is added
- Content must be fully processed by Plex before Tautulli can detect it
- Large files or remote storage may cause additional delays
- Maximum wait time is 10 minutes before the notification expires

### Agent Creation Failures

If agent creation fails for a user:
1. Check if the user exists in Tautulli's user list
2. Verify the user has accessed Plex recently (Tautulli only tracks active users)
3. Try manually creating an agent in Tautulli and re-syncing

### Connection Test Failures

- Verify Tautulli URL is accessible from Pulsarr's network
- Check API key is correct and hasn't been regenerated
- Ensure no reverse proxy authentication is blocking API access
- Test with both HTTP and HTTPS protocols

:::tip
For best results, ensure Tautulli is on the same network as Pulsarr to minimize latency and improve notification delivery speed.
:::