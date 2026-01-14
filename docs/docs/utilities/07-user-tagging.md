---
sidebar_position: 2
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# User Tagging

Automatically adds user tags to content in Sonarr and Radarr, making it easy to track which users requested which content.

## Quick Setup

1. Navigate to **Utilities → User Tagging**
2. Enable tagging for Sonarr and/or Radarr
3. Configure tag prefix (default: "pulsarr-user")
4. Set tag removal behavior (keep, remove, or prefix)
5. Click **Sync Tags Now** to apply tags to all content

<img src={useBaseUrl('/img/User-Tags.png')} alt="User Tagging Interface" />

## Configuration

| Setting | Description |
|---------|-------------|
| **Enable Tagging** | Toggle for Sonarr and Radarr instances |
| **Tag Prefix** | Customize prefix for user tags (default: "pulsarr-user") |
| **Tag Removal Mode** | Keep, Remove, or Prefix existing tags |
| **Removal Prefix** | Custom prefix for removed content tags |
| **Clean Up Orphaned Tags** | Auto-remove tags for deleted users |

### Manual Actions

| Action | Description |
|--------|-------------|
| **Create Tags** | Create tag definitions in Sonarr/Radarr |
| **Sync Tags** | Apply tags to all existing content |
| **Clean Up** | Remove orphaned tags for deleted users |
| **Remove Tags** | Remove all Pulsarr user tags (destructive) |

## Tag Removal Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| **Keep** | Preserves tags for historical tracking | Accountability, analytics |
| **Remove** | Deletes tags when content leaves watchlists | Active library management |
| **Prefix** | Adds prefix (e.g., "removed:") to existing tags | Deletion workflows with history |

:::tip Delete Sync Integration
User Tagging integrates with Delete Sync's tag-based mode. Use removal tags to trigger automated deletion workflows while preserving tag history.
:::

## Best Practices

- Use descriptive tag prefixes to avoid conflicts with existing tags
- Enable "Clean Up Orphaned Tags" to maintain tag hygiene
- Consider "Prefix Mode" for deletion workflows requiring historical tracking
- Sync tags regularly to keep Sonarr/Radarr updated

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Tags not appearing** | Verify tagging enabled; check content added via Pulsarr; run manual sync |
| **Orphaned tags accumulating** | Enable cleanup option; run manual cleanup; review tag prefix |

## API Reference

See the [User Tags API documentation](/docs/api/sync-user-tags) for detailed endpoint information.