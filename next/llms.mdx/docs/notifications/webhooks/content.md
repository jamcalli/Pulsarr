# Webhooks (/notifications/webhooks)

Webhooks post a JSON payload to a URL you choose when an event happens, for Home Assistant, n8n or your own scripts. They are an admin channel, so every endpoint gets its events for all users. Set them up under **Notifications** > **Webhooks**.

## Add an endpoint [#add-an-endpoint]

Select **Add endpoint**, then fill in:

- **Name**, any label you like.
- **URL**, where Pulsarr posts.
- **Auth header**, optional. Fill in both **Header name** and **Header value**, for example `Authorization` and `Bearer <token>`, and Pulsarr sends it with every request.
- The events to send. Pick at least one.

**Send test** posts a test event, with `"event": "test"`, to the URL and header as typed. Save the endpoint when you're done.

The switch on each saved endpoint pauses deliveries without deleting it.

## Events [#events]

| Event | Label | Sent when |
| --- | --- | --- |
| `media.available` | Media available | A movie or show becomes available in Plex. |
| `watchlist.added` | Watchlist added | A user adds something to their watchlist. |
| `watchlist.removed` | Watchlist removed | A user removes something from their watchlist. |
| `approval.created` | Approval created | A request is held for approval. |
| `approval.resolved` | Approval resolved | A held request is approved or denied. |
| `approval.auto` | Auto approved | A request goes through without needing approval. |
| `delete_sync.completed` | Delete sync complete | A delete sync run finishes. |
| `user.created` | User created | Pulsarr adds a new user. |
| `quota.cap_reached` | Watchlist cap reached | A user reaches their watchlist cap. |

## Payloads [#payloads]

Every payload has the same envelope:

```json
{
  "event": "media.available",
  "timestamp": "2026-10-23T10:30:00.000Z",
  "data": { }
}
```

`data` depends on the event. The [webhook payloads](/api/webhook-payloads/webhookMediaAvailable) in the API reference document each one, with examples. Pulsarr validates every payload against that schema before sending it, so the shape you see there is what arrives.

## Delivery [#delivery]

Your endpoint must answer with a 2xx status within about ten seconds. Timeouts, network errors, 5xx and 429 are retried for up to three attempts, a 4xx gets one attempt, and retries stop when `Retry-After` asks for more than a minute.

Pulsarr checks HTTPS certificates, so an endpoint with a self-signed certificate fails.
