---
sidebar_position: 2
---

# Multi-Instance Support

Distribute and synchronize content across multiple Sonarr and Radarr instances with intelligent routing and automated synchronization.

## Quick Setup

1. Navigate to **Sonarr** or **Radarr** in settings
2. Configure your primary instance and toggle **Default Instance** to `ON`
3. Add secondary instances
4. Edit your default instance and select targets from **Synced Instances** dropdown
5. Content added to the default instance automatically syncs to selected instances

## How It Works

```
Default Instance → Syncs to: [Instance 2, Instance 3, Instance 5]
Instance 2 → Cannot sync (not default)
Instance 3 → Cannot sync (not default)
Instance 5 → Cannot sync (not default)
```

- **Default Instance**: Routes content via rules or fallback, syncs to configured targets
- **Synced Instances**: Only configurable on the default instance
- **Non-default Instances**: Can only receive synced content, cannot initiate syncs

Each synced instance uses its own configuration (quality profiles, root folders, tags).

## Use Cases

### Quality Tier Distribution

| Instance | Purpose |
|----------|---------|
| Default | Standard quality profiles |
| Sync Target 1 | 4K profiles |
| Sync Target 2 | Archive/compressed profiles |

### Geographic Distribution

| Instance | Purpose |
|----------|---------|
| Default | Primary server |
| Sync Target 1 | Backup server |
| Sync Target 2 | Remote location |

### User-Specific Libraries

| Instance | Purpose |
|----------|---------|
| Default | General content |
| Sync Target 1 | Kids/family library |
| Sync Target 2 | Adult content library |

## Sync Operations

| Type | Description |
|------|-------------|
| **Automatic** | Content added to default instance syncs to targets automatically |
| **Manual Instance** | Sync specific instance to its configured targets |
| **Full Library** | Sync all instances to ensure consistency |

**Sync Process:**
1. Identify content in source instance
2. Evaluate content router rules for targets
3. Apply target instance's configuration
4. Update status to prevent duplicate notifications
5. Process in batches for efficiency

## Content Router Integration

- **Rule-Based Distribution**: Router rules can target multiple instances simultaneously
- **Priority Handling**: Highest priority rule wins when multiple rules target the same instance
- **Sync Compliance**: Manual syncs respect router rules (no blind copying)

## Notification Management

- **Sync Detection**: Automatically detects synced vs new content
- **Suppression**: Duplicate notifications suppressed during sync
- **Per-Instance Tracking**: Users only notified when content genuinely available

## Example Configurations

**Simple Quality Tiers:**
```
Default Sonarr (HD) → Sync to:
├── 4K Sonarr
└── Archive Sonarr
```

**Multi-Target:**
```
Default Sonarr → Sync to:
├── Family Sonarr
├── Archive Sonarr
├── Kids Sonarr
└── Backup Sonarr
```

## Best Practices

- Designate one default instance per type for predictable routing
- Use different quality profiles and root folders per target
- Leverage content router rules for automated distribution
- Monitor sync operations during initial setup

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Content not syncing** | Verify default instance has targets in Synced Instances dropdown; check target instances are online |
| **Duplicate notifications** | Check sync detection in logs; verify notification suppression enabled |
| **Sync operations failing** | Verify API keys/URLs; check storage space; review router rules for conflicts |
| **Wrong instance receiving content** | Review router rule priorities; verify default instance designation |

## API Reference

See [Sync API](/docs/api/sync-all-instances), [Sonarr API](/docs/api/sonarr), and [Radarr API](/docs/api/radarr) for programmatic access.
