---
sidebar_position: 3
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Sonarr Configuration

Configure your Sonarr instances to manage TV show downloads and monitoring.

<img src={useBaseUrl('/img/Sonarr-Instance-Card.png')} alt="Sonarr Instance Configuration" />

## Instance Settings

### Connection Settings

**Name** (required)
- Instance display name for identification
- Must be unique across all instances

**Base URL** (required)
- Sonarr server URL without trailing slash
- Example: `http://localhost:8989` or `https://sonarr.yourdomain.com`

**API Key** (required)
- Sonarr API key from Settings > General > Security

### Content Management

**Quality Profile** (required)
- Select default quality profile for new content
- Choose from available profiles in your Sonarr instance

**Root Folder** (required)
- Select default root folder for new series
- Choose from available folders in your Sonarr instance

**Tags**
- Select tags to apply to new content
- Choose from existing tags in your Sonarr instance
- Includes utility to create new tags for convenience

### Monitoring Settings

**Season Monitoring**
- All Seasons (default)
- Future Seasons
- Missing Episodes
- Existing Episodes
- First Season
- Last Season
- Latest Season
- Pilot Only
- Pilot Rolling (Auto-expand, requires session monitoring)
- First Season Rolling (Auto-expand, requires session monitoring)
- Recent Episodes
- Monitor Specials
- Unmonitor Specials
- None
- Skip

**Monitor New Items**
- Monitor all new items (default)
- Don't monitor new items

### Series Settings

**Series Type**
- Standard series (default)
- Anime series
- Daily shows (talk shows, news)

**Create Season Folders**
- Enable to create season folders
- Disable to store episodes directly in series folder (default)

### Search Settings

**Search on Add**
- Enable to automatically search when content is added (default)
- Disable to skip automatic searching

### Instance Management

**Bypass Ignored**
- Enable to bypass ignored items in Sonarr
- Disable to respect Sonarr's ignored items (default)

**Is Default**
- Enable to use as default instance when no routing rules match
- Disable for regular instance (default)

**Synced Instances**
- Select other instances to synchronize with
- Used for multi-instance content distribution

## Rolling Monitoring

Rolling monitoring options (Pilot Rolling, First Season Rolling) require:
- Session monitoring to be enabled
- Rolling monitoring configuration in Utilities

These options automatically expand monitoring based on viewing activity and provide utility to auto-cleanup when nobody is watching, reverting to their original states.