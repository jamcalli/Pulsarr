---
sidebar_position: 4
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Label Sync

Automatically synchronize Plex labels based on user watchlists and content requests, providing seamless content organization and tracking directly in your Plex library.

## Quick Setup

1. Navigate to **Utilities → Plex Label Sync**
2. Toggle **Enable Label Sync** to `ON`
3. Configure label prefix (default: "pulsarr")
4. Optionally enable **Tag Sync** to sync Radarr/Sonarr tags to Plex labels
5. Click **Sync Now** to apply labels to existing content

## Label Types

| Type | Format | Description |
|------|--------|-------------|
| **User Labels** | `pulsarr:username` | Track which users requested content (multi-user supported) |
| **Tag Labels** | Synced from Arr | Radarr/Sonarr tags synced to Plex labels in real-time |
| **Removed Labels** | Configurable | Remove, keep, or replace with special label when users removed |

## Configuration

### Basic Settings

| Setting | Description |
|---------|-------------|
| **Enable Label Sync** | Toggle feature on/off |
| **Label Prefix** | Customize prefix for user labels (default: "pulsarr") |
| **Concurrency Limit** | Control processing speed (1-20, default: 5) |

### Label Management

| Setting | Description |
|---------|-------------|
| **Cleanup Orphaned Labels** | Remove labels for deleted users |
| **Removed Label Mode** | Remove, keep, or special label behavior |
| **Removed Label Prefix** | Custom prefix for removed user labels |

### Tag Synchronization

| Setting | Description |
|---------|-------------|
| **Enable Tag Sync** | Sync Radarr/Sonarr tags to Plex labels |
| **Sync Radarr/Sonarr Tags** | Select which instances to sync from |

### Scheduling

| Setting | Description |
|---------|-------------|
| **Schedule Time** | Automatically run full sync at specific time |
| **Day of Week** | Choose days for scheduled sync |

## Running Label Sync

| Action | Description |
|--------|-------------|
| **Automatic** | Webhook-triggered on Arr import/upgrade/rename events |
| **Scheduled** | Run full sync at configured time/days |
| **Sync Now** | Manual immediate execution |
| **Cleanup** | Remove orphaned labels and clear pending queue |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Labels not appearing** | Verify Plex connection/permissions; check content exists in Plex; confirm prefix config |
| **Webhook updates not working** | Verify Arr webhook config; check endpoint URL; review logs |
| **Performance issues** | Reduce concurrency limit; schedule during off-peak; enable orphaned cleanup |