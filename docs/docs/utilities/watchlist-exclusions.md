import useBaseUrl from '@docusaurus/useBaseUrl';

# Watchlist Exclusions

Prevent specific watchlist items from being routed to Sonarr and Radarr, allowing you to control which content gets added to your library.

## Quick Setup

1. Open **Library**, then **Exclusions**
2. Find the title using search or filters
3. Expand the row and click **Exclude** next to a user to block it for them, or pick **Exclude for everyone** from the row menu
4. Click **Remove** to unblock it again

<img src={useBaseUrl('/img/Watchlist-Exclusions.png')} alt="Watchlist Exclusions Interface" />

## How It Works

When a user adds something to their Plex watchlist, the sync engine normally routes it to Sonarr or Radarr. An exclusion is a veto on that routing for a specific item. The sync engine sees the item, checks for an exclusion, and skips it if one exists.

There are two kinds:

- **Per-user exclusions** block a title for one user. Exclude a user from the expanded row, or select rows and use **Exclude** with **Their watchlisters**.
- **Global exclusions** block a title for every user, including anyone who adds it later. Use **Exclude for everyone** from the row menu, or select rows and use **Exclude** with **Everyone**.

Common reasons to use this:

- **You don't want a title auto-requested** even though a user has it watchlisted (e.g. content you've chosen not to host)
- **Prevent re-request loops after Delete Sync**: when content is removed but stays on a user's watchlist, an exclusion stops the next sync from re-requesting it

Per-user exclusions clear automatically when the user removes the item from their Plex watchlist, so re-adding it later works normally. Global exclusions never clear on their own. Remove them from the row menu (**Remove global exclusion**) or with **Remove** on selected rows. Removing a global exclusion leaves any per-user exclusions on that title in place.

:::info Interaction with Delete Sync
Excluded items count as unwatchlisted for Delete Sync. A title already in Sonarr or Radarr becomes a deletion candidate once every watchlister is excluded (or it has a global exclusion), deletion is on for its type, and the safety guards pass. Excluding current watchlisters is exactly the state the Maintainerr integration creates.
:::

## Maintainerr Integration

Automatically create exclusions when [Maintainerr](https://maintainerr.info) deletes media, so stale watchlist entries don't re-request content Maintainerr just removed.

### Quick Setup

1. Open **Library**, then **Exclusions**
2. In the **Maintainerr** section, turn on **Use Maintainerr** and enter your **Maintainerr URL**
3. Click **Save changes**

Requires Maintainerr **3.23.0 or later**, and Pulsarr must be reachable from Maintainerr.

### How It Works

Without this integration, media Maintainerr deletes can stay on users' Plex watchlists, get re-requested by the next sync, and be deleted again by Maintainerr in a churn loop. With it enabled, Maintainerr notifies Pulsarr whenever it handles media, and Pulsarr writes exclusions so the sync never re-requests it.

Pulsarr configures Maintainerr itself: it creates a webhook notification agent named "Pulsarr" in your Maintainerr instance and connects it to your rule groups. Only rule groups whose collections **delete** media are connected. Maintainerr's webhook doesn't say which action ran, so unmonitor-only groups are left unconnected to avoid excluding media that still exists.

:::tip Use Maintainerr as your removal engine
When using this integration, we recommend disabling [Delete Sync](./delete-sync) and configuring your removal policies in Maintainerr instead. This feature ensures items Maintainerr deems fit for removal stay removed and are not re-added by stale watchlists, so running both removal systems is redundant and makes it harder to reason about why content disappeared.
:::

### Configuration

| Setting | Description |
|---------|-------------|
| **Use Maintainerr** | Turns the integration on. Needs a Maintainerr URL |
| **Maintainerr URL** | Base URL of your Maintainerr instance (e.g. `http://localhost:6246`) |
| **Exclude for** | `Current watchlisters`: one exclusion per user watching it when Maintainerr deletes it, so anyone adding it later requests it fresh. `Everyone`: one global exclusion that blocks it for every user until you remove it |

### Sync Behavior

| Action | Description |
|--------|-------------|
| **On save** | Reconciles the Maintainerr configuration immediately when the switch or URL changes |
| **Scheduled** | The `maintainerr-sync` job re-checks hourly, connecting any new rule groups |
| **Sync now** | Manual immediate reconcile |

Each sync verifies the Maintainerr version, provisions the webhook config, updates rule group connections, and fires a test notification to confirm the round trip. The section's status pill reflects the last result, and the version, connected rule groups and test delivery show under the fields.

Maintainerr only adds exclusions. Remove them on the Exclusions page.

### Manual Setup

If you'd rather not give Pulsarr your Maintainerr URL, configure the webhook in Maintainerr yourself:

1. Set the `maintainerrWebhookSecret` environment variable in Pulsarr (the auto-generated secret has no UI surface, so you need to set one you know)
2. In Maintainerr, create a **Webhook** notification agent with URL `http://your-pulsarr:3003/v1/notifications/webhook/maintainerr` and the secret as the auth header
3. Set the JSON payload to include `"notification_type": "{{notification_type}}"`
4. Enable only the **Media Handled** notification type
5. Connect the agent to each rule group whose collection deletes media, and repeat for rule groups you add later

## Page Features

The Exclusions page shows one row per title on any watchlist, plus titles with a global exclusion that nobody has watchlisted. Expand a row to see each watchlister with their status and exclusion.

| Feature | Description |
|---------|-------------|
| **Search** | Filter titles by name |
| **User filter** | Show titles on one user's watchlist |
| **Content type filter** | Filter by Movies or Shows |
| **Status filter** | Filter by watchlist status (Pending, Requested, Grabbed, Notified) |
| **Exclusion filter** | Show excluded titles, titles that are not excluded, or titles with no watchlisters left |
| **Sorting** | Sort by title, watchlisters, excluded count, or last exclusion (default: newest exclusion first) |
| **Bulk actions** | Select rows to exclude them for their watchlisters or everyone, or to remove every exclusion on them |

Filters, sorting and the page live in the URL, so a filtered view can be bookmarked or shared.

## Best Practices

- Prefer excluding over asking users to remove items from their watchlists. The item stays watchlisted, so they can still see it in Plex, without triggering a request
- Use a global exclusion to block a title for everyone, including users who add it later. Per-user exclusions only cover the users you pick

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Item still being requested** | Verify the exclusion exists for the correct user, or add a global one. Check the sync engine logs |
| **Exclusion disappeared** | The user likely removed the item from their Plex watchlist, which clears their per-user exclusion automatically. Global exclusions never clear on their own |
| **Item not showing in table** | Item may not be on any user's watchlist. Check its Plex watchlist status |
| **Maintainerr status shows an error** | Verify the URL is reachable from Pulsarr and Maintainerr is 3.23.0 or later. The error shows in the Maintainerr section |
| **No exclusions after Maintainerr deletes** | Confirm the integration is enabled and the rule group's collection uses a delete action. Unmonitor-only groups are deliberately not connected |

## API Reference

See the [Watchlist Exclusions API documentation](/docs/api/watchlist-exclusions) for detailed endpoint information.
