---
sidebar_position: 2
---

# Apprise Notifications

Pulsarr integrates with [Apprise](https://github.com/caronc/apprise) to send notifications to 80+ services including Telegram, Slack, Discord, email, SMS gateways, and more through a unified interface.

## Overview

Apprise runs as a separate container that Pulsarr communicates with to dispatch notifications. When events occur, Pulsarr sends the notification payload to Apprise, which then routes it to your configured services.

**Key characteristics:**
- **Multi-platform delivery**: Send to multiple services simultaneously
- **URL-based configuration**: Simple `protocol://credentials` format for all services
- **No Apprise UI required**: Pulsarr handles all configuration; the Apprise web UI is not needed

## Setup

### Docker Compose

Run Apprise alongside Pulsarr in a combined stack:

```yaml
services:
  apprise:
    image: caronc/apprise:latest
    container_name: apprise
    ports:
      - "8000:8000"
    environment:
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
      - APPRISE_STATEFUL_MODE=simple
      - APPRISE_WORKER_COUNT=1
    volumes:
      - ./config:/config
      - ./plugin:/plugin
      - ./attach:/attach
    restart: unless-stopped

  pulsarr:
    image: lakker/pulsarr:latest
    container_name: pulsarr
    ports:
      - "3003:3003"
    volumes:
      - ./data:/app/data
      - .env:/app/.env
    restart: unless-stopped
    env_file:
      - .env
    depends_on:
      - apprise
```

Add to your `.env` file:
```sh
appriseUrl=http://apprise:8000
```

:::tip Running Separately
If Apprise runs on a different host, use the full URL: `appriseUrl=http://192.168.1.100:8000`
:::

### Verify Connection

Once both services are running, Pulsarr automatically detects the Apprise service. Check the **Notifications → Apprise** page to confirm the connection status.

## Configuration

### System Apprise URL

Set a system-wide notification URL for admin alerts (delete sync results, safety triggers, etc.):

**Notifications → Apprise → System Apprise URL**

Enter one or more Apprise URLs, comma-separated:
```
tgram://bot_token/chat_id,pover://user_key@app_token
```

### User Apprise URLs

Users can configure their own Apprise URLs for personal notifications:

- **Discord bot**: `/notifications` command → Edit Profile
- **Admin panel**: Plex → Users → Edit user

### Email Sender

Admins can configure a global email sender so users only need to enter their email address instead of a full Apprise URL.

**Setup (Notifications → Apprise):**

Set the **Email Sender** field to your SMTP URL:
```
mailtos://your-email:app_password@gmail.com
```

Once configured, users can enter `user@example.com` anywhere an Apprise URL is accepted. Pulsarr automatically routes the notification through your configured sender.

For Gmail, you'll need an [App Password](https://myaccount.google.com/apppasswords) (requires 2-Step Verification).

## Common Apprise URLs

| Service | URL Format |
|---------|------------|
| Telegram | `tgram://{bot_token}/{chat_id}` |
| Slack | `slack://{tokenA}/{tokenB}/{tokenC}` |
| Pushover | `pover://{user_key}@{app_token}` |
| Gotify | `gotifys://{hostname}/{token}` |
| Email | `mailtos://{user}:{app_password}@gmail.com` |

For the full list, see the [Apprise Wiki](https://github.com/caronc/apprise/wiki).

## Troubleshooting

### Apprise Not Detected

1. Verify both containers are running: `docker compose ps`
2. Check the `appriseUrl` in your `.env` matches the container name or IP
3. If using separate networks, ensure Pulsarr can reach Apprise on port 8000

### Notifications Not Sending

1. Test your Apprise URL directly using the **Test** button in the UI
2. Check Pulsarr logs for Apprise-related errors
3. Verify the Apprise URL format matches the [Apprise Wiki](https://github.com/caronc/apprise/wiki) examples

### Email Not Working

1. Confirm the Email Sender URL uses `mailtos://` (with TLS) not `mailto://`
2. For Gmail, ensure you're using an App Password, not your account password
3. Check if your email provider blocks "less secure" SMTP access

## Advanced Features

For broadcasting content availability to shared channels independent of individual user watchlists, see [Public Content Notifications](../utilities/05-public-content-notifications.md).
