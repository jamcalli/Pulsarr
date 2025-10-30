---
sidebar_position: 2
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# User Tagging

Automatically adds user tags to content in Sonarr and Radarr, making it easy to track which users requested which content.

## Quick Setup

1. Navigate to **Utilities → User Tagging**
2. Enable tagging for Sonarr and/or Radarr
3. Configure tag prefix (default: "pulsarr:user")
4. Set tag removal behavior (keep, remove, or prefix)
5. Click **Sync Tags Now** to apply tags to all content

<img src={useBaseUrl('/img/User-Tags.png')} alt="User Tagging Interface" />

## Configuration

Navigate to **Utilities → User Tagging**:

- **Enable Tagging**: Toggle for Sonarr and Radarr instances
- **Tag Prefix**: Customize prefix for user tags (default: "pulsarr:user")
- **Tag Removal Options**:
  - **Keep**: Preserve tags for historical tracking
  - **Remove**: Delete tags when content leaves watchlists
  - **Prefix**: Add custom prefix (e.g., "removed:") to existing tags
- **Removal Prefix**: Custom prefix for removed content tags
- **Clean Up Orphaned Tags**: Auto-remove tags for deleted users
- **Manual Actions**: Remove all user tags or sync immediately

## Features

- **Automatic User Tracking**: Tags content with usernames of requesting users
- **Multi-Instance Support**: Works across all Sonarr and Radarr instances
- **Customizable Prefix**: Configure tag prefix (default: "pulsarr:user")
- **Flexible Tag Removal**: Keep, remove, or prefix tags when content leaves watchlists
- **Tag-Based Deletion**: Integrate with Delete Sync for tag-based workflows
- **Batch Processing**: Efficiently processes large libraries

## Advanced Tag Management

When content is removed from a user's watchlist, choose how to handle tags:

**Keep Mode:**
- Preserves tags for historical tracking
- Maintains record of original requesters
- Useful for accountability and analytics

**Remove Mode:**
- Automatically deletes tags when content leaves watchlists
- Keeps tag lists clean and current
- Best for active library management

**Prefix Mode:**
- Adds customizable prefix (e.g., "removed:") to existing tags
- Preserves history while marking inactive content
- Enables custom deletion workflows with Delete Sync

## Integration with Delete Sync

User Tagging works seamlessly with Delete Sync's tag-based deletion mode:
- Configure tags to be added, modified, or removed based on watchlist changes
- Use tag status to determine when content should be deleted
- Protect content with specific tags from deletion
- Create complex deletion workflows based on tag lifecycle

## Best Practices

- Use descriptive tag prefixes to avoid conflicts with existing tags
- Enable "Clean Up Orphaned Tags" to maintain tag hygiene
- Consider "Prefix Mode" for deletion workflows requiring historical tracking
- Sync tags regularly to keep Sonarr/Radarr updated

## Troubleshooting

**Tags not appearing:**
- Verify tagging is enabled for the instance
- Check that content was added via Pulsarr (not manually)
- Run manual sync to apply tags immediately

**Orphaned tags accumulating:**
- Enable "Clean Up Orphaned Tags" option
- Run manual cleanup to remove tags for deleted users
- Review tag prefix configuration

## API Reference

See the [User Tags API documentation](/docs/api/sync-user-tags) for detailed endpoint information.