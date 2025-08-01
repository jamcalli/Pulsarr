# Plex Label Sync Service Design

## Overview

The Plex Label Sync Service enables automatic synchronization of user tags from Pulsarr to Plex labels, allowing content restrictions and filtering based on which users have requested specific content. This service supports both real-time (webhook-triggered) and batch synchronization modes.

## Architecture

### Core Components

1. **PlexLabelSyncService** - Main service handling label synchronization
2. **PendingLabelSyncProcessor** - Handles delayed syncs when content isn't immediately available
3. **Database Extensions** - New table and methods for tracking pending syncs
4. **Webhook Integration** - Hooks into existing webhook processing
5. **Plex API Extensions** - New methods for label management

## Implementation Details

### 1. Core Service (`src/services/plex-label-sync.service.ts`)

```typescript
export class PlexLabelSyncService {
  constructor(
    private plexServer: PlexServerService,
    private db: DatabaseService,
    private config: PlexLabelSyncConfig
  ) {}

  // Live mode - webhook triggered
  async syncLabelsOnWebhook(webhook: WebhookPayload): Promise<void> {
    // Extract content ID from webhook
    const contentGuid = webhook.movie 
      ? `tmdb:${webhook.movie.tmdbId}`
      : `tvdb:${webhook.series.tvdbId}`;

    // Find Plex item with retry logic
    const plexItem = await this.findPlexItemWithRetry(contentGuid);
    if (!plexItem) {
      // Queue for later processing similar to pending webhooks
      await this.queuePendingLabelSync(contentGuid, webhook);
      return;
    }

    // Get all users with this content in watchlist
    const watchlistUsers = await this.db.getWatchlistUsersByGuid(contentGuid);
    
    // Apply labels
    await this.applyUserLabels(plexItem.ratingKey, watchlistUsers);
  }

  // Batch mode - scheduled sync
  async syncAllLabels(): Promise<void> {
    const watchlistItems = await this.db.getAllActiveWatchlistItems();
    const groupedByContent = this.groupByContentGuid(watchlistItems);
    
    for (const [guid, users] of groupedByContent) {
      const plexItem = await this.findPlexItem(guid);
      if (plexItem) {
        await this.applyUserLabels(plexItem.ratingKey, users);
      }
    }
  }

  private async findPlexItemWithRetry(
    guid: string, 
    maxRetries = 5, 
    delayMs = 5000
  ): Promise<PlexMetadata | null> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Search Plex library
        const searchResults = await this.plexServer.searchByGuid(guid);
        if (searchResults.length > 0) {
          return searchResults[0];
        }
        
        // Wait before retry (content might still be processing)
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
        }
      } catch (error) {
        logger.warn(`Plex search attempt ${i + 1} failed:`, error);
      }
    }
    return null;
  }

  private async applyUserLabels(
    ratingKey: string,
    users: User[]
  ): Promise<void> {
    // Get existing labels to preserve them
    const metadata = await this.plexServer.getMetadata(ratingKey);
    const existingLabels = metadata.Label?.map(l => l.tag) || [];
    
    // Process user labels based on config
    const userLabels = users.map(user => 
      this.config.labelFormat.replace('{username}', user.username)
    );
    
    // Combine with existing labels
    const allLabels = [...new Set([...existingLabels, ...userLabels])];
    
    // Apply labels via Plex API
    await this.plexServer.updateLabels(ratingKey, allLabels);
  }
}
```

### 2. Database Schema

```sql
CREATE TABLE pending_label_syncs (
  id INTEGER PRIMARY KEY,
  guid VARCHAR(255) NOT NULL,
  content_title VARCHAR(255) NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_guid (guid)
);
```

### 3. Webhook Integration

Hook into existing webhook processing at `src/routes/v1/notifications/webhook.ts`:

```typescript
// After existing notification processing
if (config.plexLabelSync.enabled && config.plexLabelSync.liveMode) {
  // Queue label sync as non-blocking operation
  setImmediate(async () => {
    try {
      await plexLabelSyncService.syncLabelsOnWebhook(payload);
    } catch (error) {
      logger.error('Plex label sync failed:', error);
    }
  });
}
```

### 4. Plex API Extensions

Add to `src/utils/plex-server.ts`:

```typescript
async searchByGuid(guid: string): Promise<PlexMetadata[]> {
  const normalizedGuid = normalizeGuid(guid);
  const searchUrl = `${this.plexUrl}/library/all?guid=${encodeURIComponent(normalizedGuid)}`;
  const response = await this.fetch(searchUrl);
  return response.MediaContainer?.Metadata || [];
}

async updateLabels(ratingKey: string, labels: string[]): Promise<void> {
  const params = new URLSearchParams({
    'type': '1', // Assuming movie, adjust based on content type
    'id': ratingKey,
    'label.locked': '1'
  });
  
  // Add each label
  labels.forEach((label, index) => {
    params.append(`label[${index}].tag.tag`, label);
  });
  
  const url = `${this.plexUrl}/library/metadata/${ratingKey}/edit?${params}`;
  await this.fetch(url, { method: 'PUT' });
}

async getMetadata(ratingKey: string): Promise<PlexMetadata> {
  const url = `${this.plexUrl}/library/metadata/${ratingKey}`;
  const response = await this.fetch(url);
  return response.MediaContainer?.Metadata?.[0];
}
```

### 5. Configuration Schema

```typescript
export const PlexLabelSyncConfigSchema = z.object({
  enabled: z.boolean().default(false),
  liveMode: z.boolean().default(true),
  batchMode: z.boolean().default(false),
  labelFormat: z.string().default('{username}'),
  syncInterval: z.number().default(3600), // seconds
  pendingRetryInterval: z.number().default(30),
  pendingMaxAge: z.number().default(30), // minutes
  excludeLabels: z.array(z.string()).default([]),
  preserveExistingLabels: z.boolean().default(true)
});
```

### 6. Pending Sync Processor

```typescript
export class PendingLabelSyncProcessor {
  async processPendingSync(): Promise<void> {
    const pendingSyncs = await this.db.getPendingLabelSyncs();
    
    for (const sync of pendingSyncs) {
      try {
        const plexItem = await this.plexLabelSync.findPlexItem(sync.guid);
        if (plexItem) {
          const users = await this.db.getWatchlistUsersByGuid(sync.guid);
          await this.plexLabelSync.applyUserLabels(plexItem.ratingKey, users);
          await this.db.deletePendingLabelSync(sync.id);
        } else {
          await this.db.updatePendingLabelSyncRetry(sync.id);
        }
      } catch (error) {
        logger.error(`Failed to process pending sync ${sync.id}:`, error);
      }
    }
  }
}
```

## Key Features

### Live Mode
- **Webhook-triggered**: Responds immediately to content downloads
- **Retry logic**: Handles cases where Plex hasn't indexed content yet
- **Non-blocking**: Runs asynchronously to avoid slowing webhook processing
- **Pending queue**: Falls back to queue system when content not found

### Batch Mode
- **Scheduled sync**: Runs periodically to ensure consistency
- **Full reconciliation**: Syncs all watchlist items to Plex labels
- **Efficient grouping**: Groups by content to minimize API calls

### Label Management
- **Multiple labels**: Supports content having labels from multiple users
- **Label preservation**: Keeps existing labels by default
- **Flexible format**: Configurable label naming pattern
- **Exclusion list**: Can exclude certain labels from sync

## Integration Points

1. **Webhook Service**: Hooks into existing webhook processing flow
2. **Database Service**: Extends with new methods for label sync tracking
3. **Plex Server Service**: Adds label management capabilities
4. **User Tag Service**: Mirrors the tagging pattern used for Arr apps

## Benefits

1. **Content Filtering**: Enable Plex sharing rules based on who requested content
2. **Multi-user Support**: Each user gets their own label on shared content
3. **Automated Management**: No manual label maintenance required
4. **Flexible Configuration**: Support for both real-time and batch modes
5. **Resilient Design**: Handles Plex processing delays gracefully

## Example Use Cases

### Kids Content Filtering
```
- User "parent" requests kids movies
- Movies get labeled "parent" in Plex
- Kids account configured to show only "parent" OR "kids" labels
- Kids see curated content plus general kids content
```

### User-Specific Libraries
```
- Multiple users request same movie
- Movie gets labels: "john", "sarah", "mike"
- Each user's Plex account shows content with their label
- Shared content visible to all who requested it
```

### Quality Management
```
- Combine with existing tags like "4k-content"
- Users can be restricted to their requested content + quality tiers
- Flexible sharing rules based on multiple label criteria
```

## Migration Path

1. Add configuration options to settings
2. Create database migration for pending_label_syncs table
3. Implement core service and Plex API extensions
4. Add webhook integration hooks
5. Deploy pending sync processor as scheduled job
6. Enable gradually (batch mode first, then live mode)

## Performance Considerations

- Label updates are batched per content item
- Pending syncs prevent repeated failed lookups
- Configurable retry intervals and expiration
- Non-blocking webhook processing
- Efficient GUID-based content matching

## Security Considerations

- Labels are applied server-side only
- No user input in label values (prevents injection)
- Respects existing Plex permissions
- Audit logging for label changes