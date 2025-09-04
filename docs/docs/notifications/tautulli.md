---
sidebar_position: 3
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Tautulli Notifications

Tautulli integration enables native Plex notifications for users when their watchlist items become available, providing seamless notifications through the Plex mobile app.

:::note Plex Pass Required
This feature requires an active Plex Pass subscription to access RSS feeds and send notifications through Plex's notification system.
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

### No Notifications Received
1. **Verify Plex Pass**: Ensure active subscription
2. **Check RSS Feeds**: Generate in Plex settings if missing
3. **Test Connection**: Re-test Tautulli connection
4. **User Settings**: Confirm user has Tautulli notifications enabled
5. **Mobile Setup**: Verify push notifications enabled and duplicate notifications disabled

### Delayed Notifications
- Pulsarr polls every 30 seconds after content added
- Content must be processed by Plex before Tautulli detects it
- Large files or remote storage cause delays
- Maximum 10 minute wait before notification expires

### Agent Creation Issues
- Check user exists in Tautulli's user list
- Verify Tautulli API has access to user data

### Connection Issues
- Verify Tautulli URL accessible from Pulsarr
- Check API key correctness
- Ensure no reverse proxy blocking API access

