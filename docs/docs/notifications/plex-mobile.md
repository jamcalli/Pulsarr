---
sidebar_position: 3
---

# Plex Mobile Notifications

Pulsarr sends native push notifications directly to the Plex mobile app (iOS/Android) when watchlist items become available - no external services required.

**Key characteristics:**
- **Zero dependencies**: Built into Pulsarr - no Tautulli or other external services needed
- **Deep linking**: Tap a notification to open the content directly in Plex
- **Episode grouping**: Season-level notifications when multiple episodes arrive at once
- **Smart retry**: If content isn't indexed in Plex yet, retries automatically for up to 10 minutes

## Quick Setup

1. Ensure you have an active **Plex Pass** subscription
2. Navigate to **Settings → Notifications** in Pulsarr
3. Enable **Plex Mobile Notifications**
4. Enable per-user in **Plex → Users**

:::note Plex Pass Required
Plex mobile push notifications require an active Plex Pass subscription. Pulsarr automatically detects your Plex Pass status.
:::

## Setup

### Prerequisites

- Active Plex Pass subscription
- Plex server connected in Pulsarr

### Enable in Pulsarr

1. Navigate to **Settings** → **Notifications**
2. Enable **Plex Mobile Notifications**
3. Save settings

### Enable for Users

**Individual Users:**
1. Go to **Settings** → **Plex** → **User Management**
2. Click edit on a user
3. Toggle **Plex Mobile Notifications** on/off

**Bulk Updates:**
1. Select multiple users in the user table
2. Click **Bulk Edit**
3. Set Plex mobile notification preference

## Mobile App Setup

Users must have push notifications enabled in their Plex mobile app for notifications to arrive.

### Enable Push Notifications

1. Open the **Plex** app on iOS or Android
2. Go to **Settings → Notifications**
3. Enable **Push Notifications**

### Prevent Duplicate Notifications

:::warning Important
If Plex's built-in "New Content Added to Library" notification is enabled in the mobile app, users may receive **duplicate notifications** - one from Pulsarr (for their watchlist items) and one from Plex (for all new content).

To avoid this, users should **uncheck all libraries** under "New Content Added to Library" in their Plex mobile app notification settings. Pulsarr handles the personalized notifications instead.
:::

### Recommended Mobile App Settings

In the Plex mobile app under **Settings → Notifications**:

| Setting | Recommendation | Reason |
|---------|----------------|--------|
| **Push Notifications** | Enabled | Required for Pulsarr notifications |
| **New Content Added to Library** | Uncheck all libraries | Prevents duplicate notifications |

:::tip
You can leave other Plex notification types enabled (e.g., "New Devices", "Server Updates") - only "New Content Added to Library" overlaps with Pulsarr notifications.
:::

## Notification Examples

Users receive native Plex push notifications like:
- **Movies**: Notification with movie title, tapping opens the movie in Plex
- **TV Episodes**: Notification with episode title and show name, tapping opens the episode
- **TV Seasons**: When multiple episodes arrive at once, a season-level notification with episode count

## Previous Tautulli Users

Pulsarr previously used Tautulli as a middleman for Plex mobile notifications. This is now handled natively - your settings and per-user preferences were migrated automatically on upgrade.

Tautulli is no longer needed for this purpose. If you wish, you can delete the "Pulsarr - Username" notification agents that Pulsarr previously created in Tautulli.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Feature not available** | Verify Plex Pass is active on your account |
| **No notifications** | Confirm push notifications enabled in Plex mobile app; verify user has Plex mobile enabled in Pulsarr; check Pulsarr logs |
| **Delayed notifications** | Content must be indexed in Plex first; Pulsarr retries every 30 seconds for up to 10 minutes |
| **Duplicate notifications** | Uncheck libraries under "New Content Added to Library" in the Plex mobile app |
