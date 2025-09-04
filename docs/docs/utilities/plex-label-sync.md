---
sidebar_position: 4
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Label Sync

Automatically synchronize Plex labels based on user watchlists and content requests, providing seamless content organization and tracking directly in your Plex library.

## Key Features

- **Real-time Updates**: Webhook-triggered synchronization from Radarr/Sonarr for instant label updates
- **User-based Labels**: Automatically label content with usernames who requested it  
- **Tag Integration**: Sync Radarr/Sonarr tags directly to Plex labels
- **Intelligent Queue**: Queue content for labeling when not yet available in Plex
- **Batch Operations**: Full library synchronization with progress tracking
- **Flexible Management**: Configurable label formats, prefixes, and cleanup behaviors

## Label Types

**User Labels**: Track which users requested content
- Format: `{labelPrefix}:{username}` (e.g., "pulsarr:john")
- Multi-user support for content requested by multiple users

**Tag Labels**: Synchronized from Radarr/Sonarr tags
- Real-time updates when tags change in Arr instances
- Selective sync from configured instances

**Removed Labels**: Handle users removed from content
- **Remove**: Delete label completely
- **Keep**: Preserve for historical tracking  
- **Special Label**: Replace with removal-specific label

## Configuration

Navigate to **Utilities → Plex Label Sync**:

### Basic Settings
- **Enable Label Sync**: Toggle feature on/off
- **Label Prefix**: Customize prefix for user labels (default: "pulsarr")
- **Concurrency Limit**: Control processing speed (1-20, default: 5)

### Label Management  
- **Cleanup Orphaned Labels**: Remove labels for deleted users
- **Removed Label Mode**: Choose remove, keep, or special label behavior
- **Removed Label Prefix**: Custom prefix for removed user labels

### Tag Synchronization
- **Enable Tag Sync**: Sync Radarr/Sonarr tags to Plex labels
- **Sync Radarr/Sonarr Tags**: Select which instances to sync from

### Scheduling (Optional)
- **Schedule Time**: Automatically run full sync at specific time
- **Day of Week**: Choose days for scheduled sync

## Webhook Integration

Integrates with Radarr/Sonarr webhooks for real-time label updates:

1. **Webhook Trigger**: Radarr/Sonarr sends notification on import/upgrade/rename
2. **Content Matching**: Matches imported content to Plex library
3. **Label Application**: Adds user and tag labels to content
4. **Queue Processing**: Updates pending sync items

## Running Label Sync

- **Enable Automatic**: Run on configured schedule
- **Sync Now**: Manual immediate execution
- **Cleanup**: Remove orphaned labels and clear pending queue

## Troubleshooting

**Labels not appearing**:
- Verify Plex server connection and permissions
- Check content exists in Plex library
- Confirm label prefix configuration

**Webhook updates not working**:
- Verify Radarr/Sonarr webhook configuration
- Check webhook endpoint URL in Arr settings
- Review logs for processing errors

**Performance issues**:
- Reduce concurrency limit
- Schedule sync during off-peak hours
- Enable orphaned label cleanup