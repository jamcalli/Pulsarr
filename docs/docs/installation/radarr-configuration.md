---
sidebar_position: 4
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Radarr Configuration

Configure your Radarr instances to manage movie downloads and monitoring.

<img src={useBaseUrl('/img/Radarr-Instance-Card.png')} alt="Radarr Instance Configuration" />

## Instance Settings

### Connection Settings

**Name** (required)
- Instance display name for identification
- Must be unique across all instances

**Base URL** (required)
- Radarr server URL without trailing slash
- Example: `http://localhost:7878` or `https://radarr.yourdomain.com`

**API Key** (required)
- Radarr API key from Settings > General > Security

### Content Management

**Quality Profile** (required)
- Select default quality profile for new content
- Choose from available profiles in your Radarr instance

**Root Folder** (required)
- Select default root folder for new movies
- Choose from available folders in your Radarr instance

**Tags**
- Select tags to apply to new content
- Choose from existing tags in your Radarr instance
- Includes utility to create new tags for convenience

### Availability Settings

**Minimum Availability**
- Announced
- In Cinemas
- Released (default)

### Search Settings

**Search on Add**
- Enable to automatically search when content is added (default)
- Disable to skip automatic searching

### Instance Management

**Bypass Ignored**
- Enable to bypass ignored items in Radarr
- Disable to respect Radarr's ignored items (default)

**Is Default**
- Enable to use as default instance when no routing rules match
- Disable for regular instance (default)

**Synced Instances**
- Select other instances to synchronize with
- Used for multi-instance content distribution