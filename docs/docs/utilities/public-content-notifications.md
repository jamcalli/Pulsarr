---
sidebar_position: 4
---

# Public Content Notifications

Public content notifications broadcast content availability to shared channels, independent of individual user watchlists. Perfect for notifying entire communities about newly available content.

## Quick Setup

1. Navigate to **Utilities** → **Public Content Notifications**
2. Toggle **Enable Public Content Notifications** to `ON`
3. Configure notification URLs (see below)

## Configuration Fields

| Field Type | Description |
|------------|-------------|
| **Discord Webhook URLs** | General endpoints (all content) |
| **Discord Webhook URLs (Movies)** | Movie-specific endpoints |
| **Discord Webhook URLs (Shows)** | TV show-specific endpoints |
| **Apprise URLs** | General endpoints (all content) |
| **Apprise URLs (Movies)** | Movie-specific endpoints |
| **Apprise URLs (Shows)** | TV show-specific endpoints |

### Multiple URLs
All fields support multiple URLs using the **+ button**. Empty fields are automatically removed when saving.

## URL Selection Logic

The system uses **either** content-specific URLs **or** general URLs (not both):

- **Movies**: Movie-specific URLs (if configured) → otherwise General URLs
- **TV Shows**: Show-specific URLs (if configured) → otherwise General URLs
- **All configured URLs** for the selected type receive notifications

## Features

- **@ Mentions**: Discord notifications automatically mention users who have the content watchlisted and have Discord IDs associated with their user
- **Multiple Services**: Discord and Apprise work independently
- **Content Types**: Movies, TV episodes, and season packs

## Example Configurations

**Simple Setup** - All content to one channel:
```
Discord Webhook URLs: https://discord.com/api/webhooks/media-releases/token123
```

**Advanced Setup** - Separate channels:
```
Discord Webhook URLs (Movies): https://discord.com/api/webhooks/movies/token1
Discord Webhook URLs (Shows): https://discord.com/api/webhooks/tv-shows/token2
Apprise URLs: slack://workspace/channel/token
```

## Troubleshooting

**No notifications received:**
1. Feature enabled in Utilities?
2. At least one URL configured?
3. Discord/Apprise services enabled?
4. Check logs for errors

**Partial notifications:**
- Verify URL formatting
- Check service-specific configuration
- Review error logs