---
sidebar_position: 3
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Approval and Quota System

Manage user content requests with configurable quotas and administrative approval workflows. Set limits by user, require approval for specific content, and maintain control over library growth.

## Key Features

- **User Quotas**: Set daily, weekly rolling, or monthly limits per user for movies and shows
- **Approval Workflows**: Require admin approval for quota-exceeded or rule-based content
- **Automatic Expiration**: Configure requests to auto-expire or auto-approve after set timeframes
- **Bulk Operations**: Approve, reject, or delete multiple requests simultaneously
- **Smart Auto-Approval**: Automatically approve requests when content already exists in library
- **Real-time Notifications**: Discord and Apprise notifications for new approval requests

## How It Works

1. **User adds content** to their Plex watchlist
2. **System checks** quota status and routing rules
3. **Approval created** if limits exceeded or rules require it
4. **Admin reviews** and approves/rejects requests
5. **Content routes** to Sonarr/Radarr after approval

## Quota Types

**Daily Quotas**: Reset at midnight in your timezone

**Weekly Rolling**: 7-day rolling window that automatically shifts each day

**Monthly Quotas**: Calendar month-based with configurable reset day

## Configuration

### New User Defaults

Configure default quota and approval settings for newly discovered Plex users via **Utilities > New User Defaults**. This eliminates manual setup for each new user and ensures consistent policy enforcement. See the [New User Defaults](../utilities/new-user-defaults.md) guide for complete details.

### Individual User Management

Navigate to **Users** section to manage individual user quotas:

### User Quota Settings
- **Quota Type**: Daily, Weekly Rolling, or Monthly
- **Quota Limit**: Number of allowed requests per period
- **Separate Limits**: Different quotas for movies vs shows
- **Bypass Approval**: Allow trusted users unlimited requests

<img alt="User Quota Configuration" src={useBaseUrl('/img/Quota-Settings.png')} />

### User Approval Settings
- **Requires Approval**: Toggle to force all requests from a user to require approval
- **Override Quotas**: This setting applies even if user has unlimited quotas

### Approval Settings

Configure approval behavior in the **Settings** section:

- **Expiration Hours**: How long before requests auto-expire (default: 72 hours)
- **Expiration Action**: Auto-expire or auto-approve expired requests
- **Cleanup Days**: How long to keep expired requests in database
- **Notifications**: Configure Discord and Apprise notifications for new requests

<img alt="Approval System Settings" src={useBaseUrl('/img/Approvals-Settings.png')} />

## Approval Management

The approval interface provides:

- **Request Table**: View all pending, approved, rejected, and expired requests
- **Advanced Filtering**: Filter by user, status, content type, trigger reason
- **Real-time Updates**: Live updates as requests are processed
- **Bulk Actions**: Process multiple requests efficiently

<img alt="Approvals Table" src={useBaseUrl('/img/Approvals-Table.png')} />

### Approval Actions

**Individual Actions**:
- Approve & Execute: Routes content immediately
- Reject: Denies the request
- Delete: Removes from database

<img alt="Approval Details Modal" src={useBaseUrl('/img/Approvals-More-Info.png')} />

**Routing Overrides** (web UI only):
- Modify quality profile and root folder
- Adjust search settings, tags, and monitoring options
- Change series type, season monitoring (Sonarr)
- Set minimum availability (Radarr)
- Configure multi-instance syncing for default instances

**Bulk Operations**:
- Select multiple requests
- Apply action to all selected
- Add notes for record keeping

## Content Router Integration

Configure approval requirements in routing rules:

```
IF season count > 3
THEN require approval with reason "Long-running series requires approval"
```

The router stores complete routing decisions (instance, quality profile, tags) and executes them exactly as planned after approval.

## Trigger Points

Approvals are created when:

- **Quota Exceeded**: User reaches their daily/weekly/monthly limit
- **Router Rules**: Content matches rules configured for approval
- **Manual Flags**: User account set to require approval for all requests
- **Content Criteria**: Specific attributes trigger approval

## Discord Bot Integration

Manage approvals directly from Discord:

- **Direct Message Notifications**: Primary admin receives DMs with "Review Approvals" button

<img alt="Discord New Approval Notification" src={useBaseUrl('/img/Discord-Approval-New.png')} />

- **Interactive `/approvals` Command**: Browse pending requests with navigation buttons

<img alt="Discord Approval Request View" src={useBaseUrl('/img/Discord-Approval-Request.png')} />

- **Full Management Interface**: Approve, reject, view details, or delete requests

<img alt="Discord Approval Details" src={useBaseUrl('/img/Discord-Approval-More.png')} />

- **History Browser**: Filter and review past approvals by status

<img alt="Discord Approval History" src={useBaseUrl('/img/Discord-Approval-History.png')} />

- **Batch Notifications**: Multiple requests grouped to reduce notification spam
- **Mobile Friendly**: Complete approval workflow from Discord mobile app

## Usage Tracking

The system maintains detailed usage history:

- Real-time quota calculations
- Rolling window tracking
- Automatic cleanup of old records
- Statistics and reporting

## Best Practices

- Start with generous quotas and adjust based on usage
- Use router rules for premium or high-cost content
- Configure expiration to auto-handle old requests  
- Enable notifications for timely processing
- Review usage statistics monthly

## Troubleshooting

**Quotas not resetting**: Check timezone configuration and cleanup settings

**Approvals not routing**: Verify target instances are still available

**Missing notifications**: Confirm Discord/Apprise configuration

## API Reference

See [Approval API](/docs/api/approval) and [Quota API](/docs/api/quota) for programmatic access.