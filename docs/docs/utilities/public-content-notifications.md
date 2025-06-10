---
sidebar_position: 5
---

# Public Content Notifications

Configure community-wide notifications that broadcast content availability to shared channels, independent of individual user watchlists.

## Quick Setup

1. **Navigate** to Utilities → Public Content Notifications
2. **Enable** the feature toggle
3. **Configure** notification URLs:
   - **Discord**: Add webhook URLs for Discord channels
   - **Apprise**: Add URLs for Slack, Telegram, email, etc.
4. **Test** with new content releases

## Key Benefits

- **Broadcast** availability to entire communities
- **Independent** of individual watchlists  
- **Flexible** URL configuration with content-specific routing
- **Automatic** @ mentions for interested Discord users
- **Dashboard** integration for tracking delivery statistics

## Configuration Options

### Six Configuration Fields

Public content notifications provide **maximum routing flexibility** with 6 fields:

**Discord Webhook Fields:**
- **Discord Webhook URLs** - General endpoints (all content)
- **Discord Webhook URLs (Movies)** - Movie-specific endpoints  
- **Discord Webhook URLs (Shows)** - TV show-specific endpoints

**Apprise Fields:**
- **Apprise URLs** - General endpoints (all content)
- **Apprise URLs (Movies)** - Movie-specific endpoints
- **Apprise URLs (Shows)** - TV show-specific endpoints

### Multiple Destinations per Field

**Every field accepts comma-separated lists:**

```bash
# Send to multiple Discord channels
Discord Webhook URLs: https://discord.com/api/webhooks/id1/token1,https://discord.com/api/webhooks/id2/token2

# Send to multiple Apprise services  
Apprise URLs: slack://workspace/channel/token,mailto://admin@server.com,telegram://bot/chat
```

### Layered Broadcasting

Configure **both general AND specific URLs** for maximum reach:

```bash
# All content to main channel
Discord Webhook URLs: https://discord.com/api/webhooks/main-media/token1

# Movies ALSO to movie enthusiasts (both fire for movies)
Discord Webhook URLs (Movies): https://discord.com/api/webhooks/movie-buffs/token2

# Shows ALSO to TV channel (both fire for shows)  
Discord Webhook URLs (Shows): https://discord.com/api/webhooks/tv-releases/token3
```

### Service Dependencies

- **Discord**: Requires webhook URLs (Discord service can be disabled)
- **Apprise**: Requires Apprise service to be enabled
- **Database**: Records are always created for tracking

## URL Examples

### Discord Webhooks
```
https://discord.com/api/webhooks/123456789/abcdef123456
```

### Apprise URLs
```
discord://webhook_id/webhook_token
slack://token_a/token_b/token_c
mailto://user:pass@smtp.gmail.com
```

### Multiple URLs
```
url1,url2,url3
```

## Supported Content Types

- ✅ **Movies** - Single movie releases
- ✅ **TV Shows** - Individual episodes and season packs
- ✅ **Bulk Releases** - Season-level notifications for multi-episode releases
- ❌ **Tautulli** - Not supported (user-specific only)

## Error Handling

The system gracefully handles:
- **Service outages** - Other notifications continue
- **Invalid URLs** - Errors logged, processing continues  
- **Disabled services** - Clean degradation without crashes

## Documentation

For detailed configuration, examples, and troubleshooting, see the [complete Public Content Notifications guide](../notifications/public-content).

## Related Features

- [Discord Notifications](../notifications/discord) - User-specific Discord setup
- [Apprise Notifications](../notifications/apprise) - User-specific Apprise setup
- [Delete Sync](delete-sync) - Content lifecycle management