import useBaseUrl from '@docusaurus/useBaseUrl';

# New User Defaults

Configure default settings automatically applied to newly discovered Plex users, eliminating manual configuration and ensuring consistent policy enforcement.

## Quick Setup

1. Navigate to **Utilities → New User Defaults**
2. Configure sync and approval settings
3. Set movie and show quota defaults (optional)
4. Click **Save** to apply defaults for future users

<img alt="New User Defaults Configuration" src={useBaseUrl('/img/New-User-Defaults.png')} />

## Configuration

| Setting | Description |
|---------|-------------|
| **Enable sync by default** | Allow new users to sync watchlists immediately |
| **Require manual approval** | New users need approval for all requests |

### Quota Settings (Movies & Shows)

| Setting | Description |
|---------|-------------|
| **Enable quotas** | Toggle quota system for content type |
| **Quota Type** | `daily`, `weekly_rolling`, or `monthly` |
| **Quota Limit** | Number allowed per period (1-1000) |
| **Auto-approve when exceeded** | Auto-approve or require manual review |
| **Watchlist Cap** | Toggle to enable a total item limit on the user's watchlist |
| **Cap Limit** | Maximum total items allowed per content type (requires Watchlist Cap enabled) |

:::info Enforcement Order
1. **Watchlist Cap** — hard blocks routing if total items exceed cap (bypass users exempt)
2. **Router Rules** — can force approval, but cannot override a user's "Requires Approval" flag
3. **User Requires Approval** — forces approval regardless of other settings
4. **Periodic Quota** — triggers approval when period limit is exceeded (bypass users auto-approve instead)
:::

## Features

- **Automatic Application**: Settings applied when new users are discovered
- **Full Control**: Configure sync, approval, and quota defaults
- **Flexible Quotas**: Independent movie and show quota systems
- **Per-User Override**: Individual settings can be modified after creation
- **Environment Variable Support**: Configure via `.env` file for infrastructure-as-code

## Example Configurations

**Conservative (Public Servers):**
Sync disabled, approval required, monthly quotas (5 movies, 3 shows), watchlist caps (20 movies, 10 shows)

**Moderate (Friends/Family):**
Sync enabled, no approval, monthly quotas (15 movies, 10 shows) with auto-approval, watchlist caps (50 movies, 30 shows)

**Open (Private/Personal):**
Sync enabled, no approval, unlimited quotas, no caps

## Integration

**User Management**: After users are created with defaults, modify individual settings via **Plex → Users**

**Approval System**: Works with router rules and content criteria - router rules can override user-level settings

**Quota System**: Usage tracking begins immediately after quota creation with all quota types and reset schedules

## Best Practices

- Start conservative and adjust based on user behavior
- Monitor quota usage to optimize default limits
- Document policies clearly for users
- Test changes by adding a test user
- Use environment variables for reproducible infrastructure

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Defaults not applying** | Verify settings saved; confirm user is newly discovered (not re-synced); check logs |
| **Quotas not created** | Ensure quota defaults enabled; check limits within range (1-1000) |
| **Env variables not working** | Restart application; check for typos; note env vars override web UI |

## API Reference

See the [Config API documentation](/docs/api/update-config) for managing new user default settings.