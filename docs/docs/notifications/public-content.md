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

Six fields provide flexible routing options:

**Discord Fields:**
- **Discord Webhook URLs** - General endpoints (all content)
- **Discord Webhook URLs (Movies)** - Movie-specific endpoints  
- **Discord Webhook URLs (Shows)** - TV show-specific endpoints

**Apprise Fields:**
- **Apprise URLs** - General endpoints (all content)
- **Apprise URLs (Movies)** - Movie-specific endpoints
- **Apprise URLs (Shows)** - TV show-specific endpoints

### Multiple URLs
Every field supports multiple URLs using the **+ button** to add additional input fields. Empty fields are automatically removed when saving.

## URL Selection

The system determines which URLs to use based on content type:

**For Movies:**
- If **Movie-specific URLs** are configured → uses only those
- If **no Movie-specific URLs** → uses General URLs instead
- **All configured URLs** for the selected type receive notifications

**For TV Shows:**
- If **Show-specific URLs** are configured → uses only those  
- If **no Show-specific URLs** → uses General URLs instead
- **All configured URLs** for the selected type receive notifications

**Important:** The system sends to ALL configured URLs for the content type - it doesn't prioritize one over another.

## Features

- **@ Mentions**: Discord notifications automatically mention users who have the content watchlisted and have Discord IDs associated with their user
- **Multiple Services**: Discord and Apprise work independently
- **Content Types**: Movies, TV episodes, and season packs

## Example Configuration

```bash
# Simple setup - all content to one channel
Discord Webhook URLs: https://discord.com/api/webhooks/media-releases/token123

# Advanced setup - separate channels
Discord Webhook URLs (Movies): https://discord.com/api/webhooks/movies/token1
Discord Webhook URLs (Shows): https://discord.com/api/webhooks/tv-shows/token2
Apprise URLs: slack://workspace/channel/token
```

## Troubleshooting

**No notifications received:**
1. Verify feature is enabled
2. Check at least one URL field is configured
3. Ensure underlying services (Discord/Apprise) are enabled
4. Review logs for errors

**Partial notifications:**
- Check service-specific configuration
- Verify URL formatting
- Review error logs for specific failures