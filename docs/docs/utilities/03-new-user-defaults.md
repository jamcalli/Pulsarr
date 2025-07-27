---
sidebar_position: 6
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# New User Defaults

The New User Defaults system allows you to configure comprehensive default settings that will be automatically applied to newly discovered Plex users. This eliminates the need to manually configure each new user and ensures consistent policy enforcement across your system.

## Overview

When Pulsarr discovers a new Plex user (through token users or friend sync), it will automatically apply the configured default settings for:

- **Sync permissions** - Whether the user can sync their watchlist
- **Approval requirements** - Whether the user requires manual approval for content requests
- **Movie quotas** - Automatic quota limits and policies for movie requests
- **Show quotas** - Automatic quota limits and policies for show requests

## Accessing New User Defaults

Navigate to **Utilities > New User Defaults** in the web interface to configure these settings.

<img alt="New User Defaults Configuration" src={useBaseUrl('/img/New-User-Defaults.png')} />

## Configuration Options

### Sync Configuration

**Enable sync by default**
- Controls whether newly discovered users will have watchlist sync enabled automatically
- When enabled: New users can immediately sync their Plex watchlists to Sonarr/Radarr
- When disabled: New users start with sync disabled (requires manual enablement)

### Approval Configuration

**Require manual approval by default**
- Controls whether new users need manual approval for ALL content requests
- When enabled: New users will need approval for every content request, regardless of quota settings
- When disabled: New users can request content without approval (subject to quota policies)

:::info Approval Hierarchy
The approval system follows a hierarchy: **Router Rules** > **User Requires Approval** > **Quota Bypass Approval**. If a user has "requires approval" enabled, it overrides any quota auto-approval settings.
:::

### Movie Quota Configuration

**Enable movie quotas by default**
- When enabled, new users will automatically receive movie quota limits
- Configure the quota type, limit, and auto-approval behavior

**Movie Quota Settings:**
- **Quota Type**: `daily`, `weekly_rolling`, or `monthly`
- **Quota Limit**: Number of movies (1-1000) the user can request per period
- **Auto-approve when quota exceeded**: Whether movie requests beyond the quota limit should be automatically approved or require manual approval

### Show Quota Configuration

**Enable show quotas by default**
- When enabled, new users will automatically receive show quota limits
- Configure independently from movie quotas with separate settings

**Show Quota Settings:**
- **Quota Type**: `daily`, `weekly_rolling`, or `monthly` 
- **Quota Limit**: Number of shows (1-1000) the user can request per period
- **Auto-approve when quota exceeded**: Whether show requests beyond the quota limit should be automatically approved or require manual approval

## Current Status Display

The interface displays a real-time overview of what settings will be applied to new users:

- **Sync Configuration**: Shows if sync will be enabled or disabled
- **Approval Configuration**: Shows if manual approval will be required
- **Movie Quotas**: Shows quota type, limit, and auto-approval status (or "Unlimited" if disabled)
- **Show Quotas**: Shows quota type, limit, and auto-approval status (or "Unlimited" if disabled)

## Example Configurations

### Conservative Setup (Recommended for Public Servers)
```
Sync: Disabled by default
Approval: Required by default
Movie Quotas: Monthly limit of 5 movies, no auto-approval
Show Quotas: Monthly limit of 3 shows, no auto-approval
```

### Moderate Setup (Friends/Family)
```
Sync: Enabled by default
Approval: Not required by default
Movie Quotas: Monthly limit of 15 movies, auto-approve when exceeded
Show Quotas: Monthly limit of 10 shows, auto-approve when exceeded
```

### Open Setup (Private/Personal)
```
Sync: Enabled by default
Approval: Not required by default
Movie Quotas: Unlimited
Show Quotas: Unlimited
```

## How It Works

1. **User Discovery**: When Pulsarr discovers a new Plex user through token sync or friend sync
2. **Default Application**: The system automatically applies the configured default settings during user creation
3. **Database Storage**: All settings are stored in the user's database record
4. **Quota Creation**: If quota defaults are enabled, both movie and show quota records are automatically created
5. **Individual Management**: After creation, each user's settings can be individually modified via the Users page

## Environment Variable Configuration

You can also configure new user defaults via environment variables (these override web UI settings on restart):

```env
# Sync defaults
newUserDefaultCanSync=true

# Approval defaults  
newUserDefaultRequiresApproval=false

# Movie quota defaults
newUserDefaultMovieQuotaEnabled=false
newUserDefaultMovieQuotaType=monthly
newUserDefaultMovieQuotaLimit=10
newUserDefaultMovieBypassApproval=false

# Show quota defaults
newUserDefaultShowQuotaEnabled=false
newUserDefaultShowQuotaType=monthly
newUserDefaultShowQuotaLimit=10
newUserDefaultShowBypassApproval=false
```

See the [Environment Variables Reference](../development/environment-variables.md) for complete details.

## Integration with Other Systems

### User Management
- After users are created with defaults, you can modify their individual settings via **Plex > Users**
- Use the "Edit quotas" option to customize quota settings per user
- Use the user edit modal to modify sync and approval settings

### Approval System
- New user defaults work seamlessly with the [Approval & Quota System](../features/approval-and-quota-system.md)
- Router rules can still override user-level approval requirements
- Content criteria and other approval triggers remain functional

### Quota System
- Quota defaults integrate with the existing quota maintenance system
- Usage tracking begins immediately after quota creation
- All quota types and reset schedules work with default-created quotas

## Best Practices

1. **Start Conservative**: Begin with restrictive defaults and relax them based on user behavior
2. **Monitor Usage**: Review quota usage patterns to adjust default limits appropriately
3. **Document Policies**: Communicate your quota and approval policies to users
4. **Regular Review**: Periodically review and adjust defaults based on server capacity and user needs
5. **Test Changes**: Use the test workflow by deleting and re-adding a user to verify new defaults work as expected

## Troubleshooting

**New users aren't getting default settings**
- Verify the settings are saved in the New User Defaults page
- Check that the user is actually new (not just re-synced)
- Review application logs for any quota creation errors

**Default quotas aren't being created**
- Ensure quota defaults are enabled in the configuration
- Check database logs for constraint or permission errors
- Verify quota limits are within valid range (1-1000)

**Environment variables not taking effect**
- Environment variables only apply on application restart
- Web UI settings are overridden by environment variables when present
- Check for typos in environment variable names