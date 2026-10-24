# Approval settings (/requests/approval-settings)

Find these under **Requests** > **Approval settings**.

## Expiration [#expiration]

**Expire approval requests** closes pending requests that wait too long for a decision. **Expire after** sets how long a request can wait.

**When a request expires** decides what happens next:

- **Mark as expired** closes the request and sends nothing to Sonarr or Radarr.
- **Approve automatically** approves it and sends it where it was routed.

**Approve automatically when a quota resets** approves requests held for quota, oldest first, once the user has room again. It works whether or not expiration is on.

## Notifications [#notifications]

**Send approval notifications to** picks where admins hear about requests that need a decision. The choices are **All channels**, **Apprise only**, **Discord webhook and direct messages**, **Discord direct messages only**, **Discord webhook only** and **None**. Set up the channels themselves under **Notifications**.

## Cleanup [#cleanup]

**Delete expired records after** removes expired requests older than this from **History**. Cleanup only runs while **Expire approval requests** is on.

## Approval maintenance [#approval-maintenance]

Expiring requests, approving them when a quota resets, and cleaning up old records all happen in one maintenance job. **Run on a schedule** turns it on or off, and **Run every** sets how often it runs.
