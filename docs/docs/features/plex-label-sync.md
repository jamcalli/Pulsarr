---
sidebar_position: 4
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Label Sync

Automatically synchronize Plex labels based on user watchlists and content requests. This powerful feature bridges Pulsarr's user management with Plex's labeling system, providing seamless content organization and tracking directly in your Plex library.

## Key Features

- **Real-time Label Updates**: Webhook-triggered synchronization from Radarr/Sonarr for instant label updates
- **User-based Labels**: Automatically label content with usernames who requested it
- **Radarr/Sonarr Tag Integration**: Sync tags from your Arr instances directly to Plex labels
- **Intelligent Pending Queue**: Queue content for labeling when it's not yet available in Plex
- **Flexible Label Management**: Configurable label formats, prefixes, and cleanup behaviors
- **Batch Operations**: Full library synchronization with progress tracking
- **Orphaned Label Cleanup**: Remove labels for deleted users and expired content
- **Performance Optimized**: Configurable concurrency limits and efficient processing

## How It Works

1. **Content Added**: User adds content to their Plex watchlist
2. **Content Acquired**: Radarr/Sonarr downloads and imports the content, then sends webhook notification
3. **Real-time Sync**: Webhook triggers label update in Plex
4. **User Labeling**: Content is labeled with requesting user's name
5. **Tag Integration**: Radarr/Sonarr tags are optionally synced as Plex labels
6. **Queue Processing**: Pending items are processed when they become available

## Label Types

### User Labels
Labels that track which users requested specific content:

- **Format**: `{labelPrefix}:{username}` (e.g., "pulsarr:john", "pulsarr:sarah")
- **Multi-User Support**: Content can have multiple user labels if requested by multiple users
- **Dynamic Updates**: Labels are added/removed as users add/remove content from watchlists

### Tag Labels
Labels synchronized from Radarr/Sonarr tags:

- **Radarr Tags**: Movie tags synced to Plex movie labels
- **Sonarr Tags**: Series tags synced to Plex show labels
- **Webhook Triggered**: Real-time updates when tags change in Arr instances
- **Selective Sync**: Configure which Arr instances to sync tags from

### Removed User Labels
Special handling for users who are removed from content:

- **Remove Mode**: Delete the user label completely
- **Keep Mode**: Preserve the label for historical tracking
- **Special Label Mode**: Replace with a "removed" label (e.g., "pulsarr:removed:john")

## Configuration

Navigate to **Utilities** section to configure Plex Label Sync:

### Basic Settings

- **Enable Label Sync**: Toggle the entire feature on/off
- **Label Prefix**: Customize the prefix for user labels (default: "pulsarr")
- **Concurrency Limit**: Control processing speed (1-20, default: 5)

### Label Management

- **Cleanup Orphaned Labels**: Remove labels for deleted users during sync operations
- **Removed Label Mode**: How to handle labels when users are removed from content:
  - **Remove**: Delete the label completely
  - **Keep**: Preserve for historical tracking
  - **Special Label**: Replace with removal-specific label

- **Removed Label Prefix**: Custom prefix for removed user labels (default: "pulsarr:removed")

### Tag Synchronization

- **Enable Tag Sync**: Sync Radarr/Sonarr tags to Plex labels
- **Sync Radarr Tags**: Include movie tags from Radarr instances
- **Sync Sonarr Tags**: Include series tags from Sonarr instances

### Scheduling (Optional)

- **Schedule Time**: Automatically run full sync at specific time
- **Day of Week**: Choose which days to run scheduled sync

## Webhook Integration

### Real-time Updates
Plex Label Sync integrates with Radarr/Sonarr webhooks for instant label updates:

1. **Radarr/Sonarr Webhook**: Triggers on movie/episode import
2. **Content Identification**: Matches imported content to Plex library
3. **Label Application**: Adds user and tag labels to newly imported content
4. **Queue Processing**: Updates any pending sync items

### Supported Webhook Events
- **On Import**: Content successfully imported to library
- **On Upgrade**: Content quality upgraded
- **On Rename**: Content files renamed or moved

## Performance Optimization

### Concurrency Control
- **Configurable Limits**: Adjust concurrent operations (1-20)
- **Optimal Settings**: Default of 5 works well for most setups
- **Large Libraries**: Consider increasing for faster processing
- **Resource Constraints**: Reduce if experiencing performance issues

### Efficient Processing
- **Delta Updates**: Only processes changed content during routine syncs
- **Batch Operations**: Groups multiple label changes for efficiency
- **Smart Caching**: Reduces redundant Plex API calls

## Troubleshooting

### Common Issues

**Labels not appearing in Plex**:
- Verify Plex server connection and permissions
- Check that content exists in Plex library
- Confirm label prefix configuration

**Webhook updates not working**:
- Verify Radarr/Sonarr webhook configuration
- Check webhook endpoint URL in Arr instance settings
- Review logs for webhook processing errors

**High memory usage during sync**:
- Reduce concurrency limit in configuration
- Process libraries in smaller batches
- Consider running sync during off-peak hours

**Pending items not processing**:
- Check if content actually exists in Plex
- Verify GUID matching between Plex and Arr instances
- Review pending sync queue in database

### Performance Tuning

**For Large Libraries** (>10,000 items):
- Increase concurrency limit to 8-10
- Enable orphaned label cleanup
- Schedule regular maintenance during off-hours

**For Resource-Limited Systems**:
- Set concurrency limit to 2-3
- Disable tag sync if not needed
- Use "keep" mode for removed labels to reduce processing

## Integration Examples

### Content Organization Workflows

**User-based Collections**:
```
Filter: Label contains "pulsarr:username"
Result: All content requested by specific user
```

**Department/Family Sections**:
```
Filter: Label contains "pulsarr:kids" OR "pulsarr:adults"
Result: Content separated by target audience
```

**Request Tracking**:
```
Filter: Label contains "pulsarr:removed:"
Result: Previously requested content for cleanup consideration
```

### Advanced Tag Usage

**Quality Profiles**:
```
Radarr Tag: "4k-only" → Plex Label: "4k-only"
Result: Easy identification of high-quality content
```

**Content Categories**:
```
Sonarr Tags: "anime", "documentary" → Plex Labels: "anime", "documentary"
Result: Enhanced content discovery and filtering
```

## Best Practices

### Label Management
- Use descriptive label prefixes that align with your organization system
- Enable orphaned label cleanup to maintain database hygiene
- Choose appropriate removed label mode based on your tracking needs

### Performance
- Start with default concurrency settings and adjust based on performance
- Schedule full syncs during low-usage periods
- Monitor system resources during initial large library syncs

### Integration
- Configure webhooks in all Radarr/Sonarr instances for real-time updates
- Use consistent tagging strategies across Arr instances
- Consider label-based smart collections for enhanced Plex organization

### Maintenance
- Run periodic cleanup operations to remove orphaned labels
- Review pending sync queue regularly to identify processing issues
- Monitor logs for webhook processing errors and connectivity issues

## Environment Configuration

The Plex Label Sync feature can be configured via environment variables for advanced deployments. See the [Environment Variables](../development/environment-variables.md#plex-label-sync-configuration) reference for detailed configuration options.

## API Reference

Complete API documentation for label operations is available in the [Labels API](/docs/api/labels) reference.