---
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Advanced Content Routing

Intelligently direct content to the appropriate Sonarr/Radarr instances using powerful predicate-based routing rules.

:::info Migration Note
If you're upgrading from a version prior to 0.2.15, you may need to delete and recreate your content routes if you experience routing issues.
:::

<img src={useBaseUrl('/img/Content-Route-1.png')} alt="Content Router Interface" />

<img src={useBaseUrl('/img/Content-Route-2.png')} alt="Content Router Advanced Interface" />

## Key Features

**Conditional Logic**: Complex decision trees with AND/OR operators, nested condition groups, and priority-based processing.

**Routing Criteria**: Route content based on genre, user, language, year, certification, or season count.

**Multi-Instance Support**: Send content to multiple instances simultaneously with different configurations.

## Automatic Anime Detection

Pulsarr automatically detects anime content to enable targeted routing and processing. When content is processed through the Content Router, it checks external IDs (TVDB, TMDB, IMDb) against a comprehensive anime database.

**How it works:**
- Downloads anime database from the [anime-lists repository](https://github.com/Anime-Lists/anime-lists) 
- Updates automatically every **Sunday at 3 AM**
- Matches content IDs against anime database entries
- Automatically adds "anime" to content genres when matched
- Enables anime-specific routing rules (e.g., `genre contains "Anime"`)

**Database Sources:**
- **Primary**: anime-list-full.xml from anime-lists GitHub repository
- **Supported IDs**: TVDB, TMDB, IMDb external identifiers
- **Update Schedule**: Weekly automatic updates (Sundays at 3 AM)

This seamless detection allows you to create routing rules like `IF genre contains "Anime"` without manually tagging content, as the system automatically identifies and classifies anime for you.

## Creating Rules

Each rule consists of:
- **Conditions**: Genre contains "Anime", User equals "KidsAccount", etc.
- **Target Instance**: Which Sonarr/Radarr instance receives the content
- **Instance Settings**: Quality profile, root folder, monitoring options
- **Priority**: Higher priority rules take precedence

## Instance Configuration Overrides

When creating routing rules, you can override these instance settings:

### Sonarr Overrides

**Core Settings:**
- **Quality Profile**: Override default quality profile
- **Root Folder**: Route to specific folder path
- **Tags**: Apply specific tags for organization
- **Search on Add**: Automatically search when added

**Series Settings:**
- **Series Type**: Override series type (`standard`, `anime`, `daily`)
- **Season Monitoring**: Override monitoring strategy:
  - `all` - All Seasons
  - `future` - Future Seasons
  - `missing` - Missing Episodes
  - `existing` - Existing Episodes
  - `firstSeason` - First Season
  - `lastSeason` - Last Season
  - `latestSeason` - Latest Season
  - `pilot` - Pilot Only
  - `pilotRolling` - Pilot Rolling (Auto-expand, requires session monitoring)
  - `firstSeasonRolling` - First Season Rolling (Auto-expand, requires session monitoring)
  - `recent` - Recent Episodes
  - `monitorSpecials` - Monitor Specials
  - `unmonitorSpecials` - Unmonitor Specials
  - `none` - None
  - `skip` - Skip

### Radarr Overrides

**Core Settings:**
- **Quality Profile**: Override default quality profile
- **Root Folder**: Route to specific folder path
- **Tags**: Apply specific tags for organization
- **Search on Add**: Automatically search when added

### Routing Conditions

**Available Fields:**
- **Genres**: Content genre categories
- **User**: User ID or username
- **Year**: Release year
- **Certification**: Content rating (PG-13, R, TV-MA, etc.)
- **Original Language**: Original language of content
- **Season**: Season number (Sonarr only)

## Multi-Instance Routing

**Multiple Instance Support**: Content router rules can send the same content to multiple instances simultaneously. For example:
- Anime Rule 1 → Anime-Sonarr-HD (priority 100)  
- Anime Rule 2 → Anime-Sonarr-4K (priority 90)
- Both rules fire for anime content, sending it to both instances with their respective configurations

**Priority Evaluation**: Priorities only matter when multiple rules target the *same* instance - highest priority rule wins and applies its settings (quality profile, root folder, etc.).

For comprehensive multi-instance synchronization and distribution features, see [Multi-Instance Support](multi-instance-support).

## Rule Processing

When content is added to a watchlist:
1. All routing rules are evaluated in priority order
2. Content is sent to all matching instances (multiple instances supported)
3. For multiple rules targeting the same instance, highest priority wins

## Example Rules

**Anime Routing:**
```
IF genre contains "Anime" 
THEN route to "Anime-Sonarr" with "HD-1080p" profile
```

**User-based Routing:**
```
IF user equals "KidsAccount"
THEN route to "Family-Sonarr" with "Family" profile in "/kids" folder
```

**Year-based Routing:**
```
IF year is less than 2000
THEN route to "Classics-Radarr" with "Archive" profile
```

## Best Practices

- Use higher priorities (90-100) for specific rules
- Start with simple rules before adding complexity
- Review logs if content isn't routing as expected