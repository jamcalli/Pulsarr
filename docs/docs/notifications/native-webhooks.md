---
sidebar_position: 4
---

# Native Webhooks

Native webhooks allow Pulsarr to send real-time JSON payloads to external systems when events occur. This enables integration with automation platforms, custom scripts, and third-party services without relying on intermediary notification services.

## Overview

When configured events occur in Pulsarr, HTTP POST requests are sent to your specified endpoints with structured JSON payloads containing event details. This provides a flexible foundation for building custom integrations.

**Key characteristics:**
- **Fire-and-forget delivery**: Payloads are sent asynchronously without blocking Pulsarr operations
- **Structured payloads**: Consistent JSON schemas for each event type
- **Authentication support**: Optional custom headers for secured endpoints
- **Multiple endpoints**: Configure different endpoints for different event types

## Event Types

Pulsarr supports the following webhook events:

| Event | Description |
|-------|-------------|
| `media.available` | Content becomes available to watch in Plex |
| `watchlist.added` | User adds content to their Plex watchlist |
| `watchlist.removed` | User removes content from their watchlist |
| `approval.created` | New approval request submitted (quota exceeded, rule triggered) |
| `approval.resolved` | Approval request approved or rejected by admin |
| `approval.auto` | Content auto-approved based on rules |
| `delete_sync.completed` | Delete sync job finishes processing |
| `user.created` | New user added to Pulsarr |

:::tip Payload Documentation
Full payload schemas with examples are available in the [API Reference](/docs/api/webhook-payloads).
:::

## Setup

### Creating a Webhook Endpoint

1. Navigate to **Settings** → **Notifications**
2. Scroll to the **Native Webhooks** section
3. Click **Add Webhook Endpoint**
4. Configure the endpoint:
   - **Name**: A friendly identifier (e.g., "Home Assistant", "n8n Workflow")
   - **URL**: The full webhook URL to receive payloads
   - **Authentication** (optional): Add a custom header for authentication
   - **Events**: Select which events trigger this webhook
5. Click the **Test** button to verify connectivity
6. Click **Create** to save the endpoint

:::warning Test Required
You must successfully test the connection before saving. This ensures your endpoint is reachable and responding correctly.
:::

### Authentication Options

For secured endpoints, enable the authentication header option:

- **Header Name**: The header key (e.g., `Authorization`, `X-Webhook-Secret`)
- **Header Value**: The secret value (e.g., `Bearer your-token-here`)

Common patterns:
```
Authorization: Bearer <token>
X-API-Key: <api-key>
X-Webhook-Secret: <shared-secret>
```

## Payload Structure

All webhook payloads follow a consistent envelope structure:

```json
{
  "event": "media.available",
  "timestamp": "2024-12-20T10:30:00.000Z",
  "data": {
    // Event-specific payload
  }
}
```

Each event type has its own `data` schema. For example, `media.available` includes:

```json
{
  "event": "media.available",
  "timestamp": "2024-12-20T10:30:00.000Z",
  "data": {
    "mediaType": "movie",
    "title": "Dune: Part Two",
    "guids": ["imdb:tt15239678", "tmdb:693134"],
    "posterUrl": "https://image.tmdb.org/t/p/w500/...",
    "isBulkRelease": false,
    "instanceType": "radarr",
    "instanceId": 1,
    "watchlistedBy": [
      { "userId": 1, "username": "john_doe", "alias": "John" }
    ]
  }
}
```

For complete payload schemas and examples, see the [Webhook Payloads API Reference](/docs/api/webhook-payloads).

## Example Integrations

### Home Assistant

Create an automation triggered by Pulsarr webhooks:

```yaml
automation:
  - alias: "Pulsarr Media Available"
    trigger:
      - platform: webhook
        webhook_id: pulsarr_media_available
        allowed_methods:
          - POST
    action:
      - service: notify.mobile_app
        data:
          title: "{{ trigger.json.data.title }} is ready!"
          message: "Your watchlist item is now available on Plex"
```

Configure Pulsarr with the Home Assistant webhook URL:
```
https://your-home-assistant.local/api/webhook/pulsarr_media_available
```

### n8n

1. Create a new workflow with a **Webhook** trigger node
2. Copy the webhook URL from n8n
3. Add the URL to Pulsarr as a new endpoint
4. Use **IF** nodes to route based on `{{ $json.event }}` type
5. Connect to notification nodes (Slack, Discord, email, etc.)

## Troubleshooting

### Webhook Not Triggering

1. **Verify endpoint is enabled**: Check the endpoint status in the webhooks list
2. **Check event selection**: Ensure the relevant events are selected for the endpoint
3. **Review logs**: Check Pulsarr logs for webhook dispatch errors

### Connection Test Fails

1. **URL accessibility**: Ensure the URL is reachable from the Pulsarr server
2. **HTTPS certificates**: For self-signed certs, the endpoint may be rejected
3. **Firewall rules**: Verify the target port is open
4. **Authentication**: Double-check header name and value if using auth

### Payloads Not Received

1. **Endpoint response**: Your endpoint must return a 2xx status code
2. **Timeout**: Endpoints must respond within 10 seconds
3. **Payload size**: Ensure your receiver can handle the payload size

### Debugging Payloads

Use a service like [webhook.site](https://webhook.site) or [RequestBin](https://requestbin.com) to inspect payloads during development. Create a temporary endpoint, add it to Pulsarr, and trigger events to see the exact payload structure.
