---
sidebar_position: 3
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Tautulli Notifications

Tautulli integration enables native Plex mobile app notifications when watchlist items become available.

## Quick Setup

1. Ensure you have an active **Plex Pass** subscription
2. Generate RSS feeds in Pulsarr: **Settings → Plex → Generate RSS Feeds**
3. Navigate to **Settings → Notifications** in Pulsarr
4. Enable **Tautulli Notifications** and enter your Tautulli URL + API key
5. Click **Test Connection** and save
6. Enable Tautulli notifications per-user in **Plex → Users**

:::note Plex Pass Required
This feature requires an active Plex Pass subscription for RSS feeds and Plex's notification system.
:::

:::warning Important Setup Information
Pulsarr hands off notification delivery to Tautulli, which then sends notifications through Plex mobile apps. **Users must properly configure their Plex mobile app notification settings** for this to work. Review the complete [Tautulli Notification Agents Guide](https://github.com/Tautulli/Tautulli/wiki/Notification-Agents-Guide#plex-android--ios-app) for detailed mobile app configuration requirements.
:::

## How It Works

1. **Content Added**: New content added to Radarr/Sonarr triggers watchlist matching
2. **Queue Notification**: Matching content queues notifications for interested users  
3. **Tautulli Polling**: Pulsarr polls Tautulli every 30 seconds to detect content in Plex
4. **Send Notification**: Once detected, native push notifications sent to Plex mobile apps
5. **Automatic Management**: Creates and manages Tautulli notification agents per user

## Key Features

- **Native Plex Notifications**: Push notifications directly through Plex mobile apps
- **Automatic Agent Management**: Creates "Pulsarr - Username" agents for each user
- **Smart Content Matching**: Multiple strategies to match content (Plex keys, GUIDs, metadata)
- **Episode Grouping**: Season notifications when multiple episodes are added
- **User Control**: Individual enable/disable per user

## Setup

### Prerequisites

- Active Plex Pass subscription
- Tautulli installed and configured with your Plex server  
- Generated RSS feeds in Pulsarr (Settings → Plex → Generate RSS Feeds)

### Configure Tautulli Integration

1. Navigate to **Settings** → **Notifications** in Pulsarr
2. Enable **Tautulli Notifications**
3. Enter your configuration:
   - **Tautulli URL**: Full URL (e.g., `http://192.168.1.100:8181`)
   - **API Key**: Found in Tautulli Settings → Web Interface → API Key
4. Click **Test Connection**
5. Save settings

The system automatically creates notification agents for all users - no manual agent setup required.

### Enable for Users

**Individual Users:**
1. Go to **Settings** → **Plex** → **User Management**
2. Click edit on a user
3. Toggle **Tautulli Notifications** on/off

**Bulk Updates:**
1. Select multiple users in the user table
2. Click **Bulk Edit**
3. Set Tautulli notification preference

## Mobile App Setup

Users receive notifications through their **Plex mobile apps** (iOS/Android). Required setup:

### Enable Push Notifications
- **iOS**: Plex app → Settings → Notifications → Enable Push Notifications
- **Android**: Plex app → Settings → Notifications → Enable Push Notifications + Allow in system settings

### Prevent Duplicate Notifications
:::warning Important
Users must **disable** "New Content Added to Library" notifications in their Plex mobile app settings to avoid receiving both Pulsarr notifications (for watchlist items) and generic Plex notifications (for all content).

See [Tautulli documentation](https://github.com/Tautulli/Tautulli/wiki/Notification-Agents-Guide#plex-android--ios-app) for detailed steps.
:::

## Notification Examples

Users receive notifications like:
- **Movies**: "Your watchlist item 'Movie Title' has been added to the library"
- **TV Episodes**: "New episode of 'Show Title' available! Season X Episode Y has been added"
- **TV Seasons**: "New season of 'Show Title' available! Multiple episodes have been added"

Notifications include movie/show artwork and tap to open in Plex.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **No notifications** | Verify Plex Pass active; generate RSS feeds; test Tautulli connection; confirm user has Tautulli enabled; check mobile push settings |
| **Delayed notifications** | Pulsarr polls every 30s; content must be processed by Plex first; large files/remote storage cause delays; 10 min max wait |
| **Agent creation issues** | Check user exists in Tautulli's user list; verify API has user data access |
| **Connection issues** | Verify Tautulli URL accessible from Pulsarr; check API key; ensure no reverse proxy blocking |
