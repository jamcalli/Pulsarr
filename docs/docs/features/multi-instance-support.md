---
sidebar_position: 2
---

# Multi-Instance Support

Pulsarr provides comprehensive multi-instance support, allowing you to distribute and synchronize content across multiple Sonarr and Radarr instances with intelligent routing and automated synchronization.

## Core Features

**Instance Synchronization**: Automatically sync content between instances using configurable sync relationships and default instance behavior.

**Content Distribution**: Send the same content to multiple instances simultaneously with different configurations (quality profiles, root folders, etc.).

**Sync Operations**: Manual and automated synchronization that respects content router rules and suppresses duplicate notifications.

## Instance Configuration

### Default Instance Behavior

Each instance type (Sonarr/Radarr) can have one designated default instance:

- **Routing Target**: Content can route to the default instance through routing rules or as a fallback
- **Automatic Sync**: When content hits the default instance, it automatically syncs to all configured secondary instances
- **Sync Authority**: Only the default instance can sync content to other instances

### Synced Instances Configuration

Only the default instance contains a `syncedInstances` array that defines its sync targets:

```json
{
  "syncedInstances": [2, 3, 5]
}
```

This means when content is added to the default instance, it will automatically sync to instances 2, 3, and 5 using their respective configurations.

### Instance Sync Architecture

```
Default Instance → Syncs to: [Instance 2, Instance 3, Instance 5]
Instance 2 → Cannot sync (not default)
Instance 3 → Cannot sync (not default) 
Instance 5 → Cannot sync (not default)
```

Non-default instances cannot sync content to other instances - they can only receive synced content from the default instance.

## Content Distribution Scenarios

### Quality Tier Distribution

**Use Case**: Maintain the same content across different quality tiers.

**Setup**:
- Default Instance: Standard quality profiles
- Sync Target 1: High-quality 4K profiles
- Sync Target 2: Archive/lower quality profiles

**Result**: All content appears in three instances with appropriate quality settings for each tier.

### Geographic Distribution

**Use Case**: Distribute content across different servers or locations.

**Setup**:
- Default Instance: Primary server
- Sync Target 1: Backup server
- Sync Target 2: Remote location server

**Result**: Content redundancy across multiple locations with automatic synchronization.

### User-Specific Libraries

**Use Case**: Maintain separate libraries for different user groups while sharing popular content.

**Setup**:
- Default Instance: General content library
- Sync Target 1: Kids/family content library
- Sync Target 2: Adult content library

**Result**: Popular content appears in all libraries, while specific content routes to appropriate libraries.

## Sync Operations

### Automatic Synchronization

**Default Instance Sync**: When content is added to the default instance, it automatically syncs to all configured secondary instances using their specific settings.

**Router-Aware Sync**: Sync operations use the content router to determine appropriate target instances rather than blind copying.

**Notification Suppression**: Duplicate notifications are automatically suppressed during sync operations to prevent notification spam.

### Manual Synchronization

Manual sync operations are available for:
- **Specific Instance Sync**: Sync content from one instance to its configured targets
- **Full Library Sync**: Sync all instances to ensure consistency
- **Progress Tracking**: Real-time progress monitoring during sync operations

### Sync Process Flow

1. **Source Detection**: Identify content in source instance
2. **Router Evaluation**: Use content router rules to determine target instances
3. **Target Configuration**: Apply target instance's quality profiles, root folders, and tags
4. **Status Tracking**: Update sync status to prevent duplicate notifications
5. **Batch Processing**: Process multiple items efficiently
6. **Completion Verification**: Ensure sync completed successfully

## Integration with Content Router

Multi-instance support works seamlessly with content routing:

**Rule-Based Distribution**: Content router rules can send content to multiple instances simultaneously based on different criteria.

**Priority Handling**: When multiple rules target the same instance, the highest priority rule determines the instance configuration (quality profile, root folder, etc.).

**Sync Compliance**: Manual sync operations respect content router rules instead of performing blind content copying.

## Notification Management

**Sync Detection**: The system automatically detects when content is being synced between instances.

**Notification Suppression**: Duplicate notifications are suppressed during sync operations to prevent spam.

**Status Tracking**: Per-instance status tracking ensures users only receive notifications when content is genuinely available.

**Webhook Processing**: Intelligent webhook processing distinguishes between new content and synced content.

## Best Practices

### Configuration
- Designate one instance per type as the default for predictable routing behavior
- Configure sync relationships based on your content distribution strategy
- Use different quality profiles and root folders for each target instance

### Performance
- Monitor sync operations during initial setup to ensure proper performance
- Consider batch processing for large library synchronizations
- Use appropriate polling intervals for large instance configurations

### Content Management
- Leverage content router rules for automated distribution
- Use sync operations for manual library maintenance
- Regularly verify sync status across instances

## Example Configurations

### Simple Quality Tiers
```
Default Sonarr (HD) → Sync to:
├── 4K Sonarr (Ultra HD profiles)
└── Archive Sonarr (Compressed profiles)
```

### Multi-Target Distribution
```
Default Sonarr → Syncs to:
├── Family Sonarr
├── Archive Sonarr  
├── Kids Sonarr
└── Backup Sonarr
```

This powerful multi-instance architecture enables sophisticated content distribution strategies while maintaining automated synchronization and intelligent notification handling.