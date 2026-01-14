---
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Advanced Content Routing

Build custom routing rules using AND/OR logic to direct content to the appropriate Sonarr/Radarr instances with specific configurations.

<img src={useBaseUrl('/img/Content-Route-1.png')} alt="Content Router Interface" />

## Quick Setup

1. Navigate to **Content Router** in the Pulsarr interface
2. Click **Add Rule** to create a new routing rule
3. Configure conditions using AND/OR logic (e.g., "IF genre contains 'Anime' AND year > 2020")
4. Select target instance and configure overrides (quality profile, root folder)
5. Optionally set rule to require approval or bypass quotas
6. Set priority (only matters when multiple rules target the same instance - highest wins)
7. Save and test by adding content that matches your rule

## Routing Conditions

Build rules using any combination of these fields with AND/OR logic:

| Field | Description | Example |
|-------|-------------|---------|
| **Genre** | Content genre categories | `genre contains "Anime"` |
| **User** | User ID or username | `user equals "KidsAccount"` |
| **Year** | Release year | `year > 2000` |
| **Certification** | Content rating | `certification in ["PG", "PG-13"]` |
| **Original Language** | Source language | `language equals "Japanese"` |
| **Season** | Season number (Sonarr only) | `season > 3` |
| **IMDb Rating** | IMDb score with optional vote count | `imdbRating > 7.0` |
| **RT Critic Rating** | Rotten Tomatoes critic score (0-100) | `rtCriticRating > 80` |
| **RT Audience Rating** | Rotten Tomatoes audience score (0-100) | `rtAudienceRating > 70` |
| **TMDB Rating** | TMDB score (0-10) | `tmdbRating > 6.5` |
| **Streaming Service** | Available streaming platforms | `streamingService contains "Netflix"` |

:::tip Automatic Anime Detection
Pulsarr automatically detects anime by checking TVDB/TMDB/IMDb IDs against the [anime-lists database](https://github.com/Anime-Lists/anime-lists), updated weekly. This adds "anime" to content genres automatically, enabling rules like `genre contains "Anime"` without manual tagging.
:::

## Rule Actions

Each rule can configure special behaviors:

| Action | Description |
|--------|-------------|
| **Require Approval** | Force content matching this rule to require admin approval |
| **Bypass Quotas** | Allow content to skip user quota limits |
| **Approval Reason** | Custom message shown when approval is required |

## Instance Overrides

Override default instance settings when routing:

### Sonarr

| Setting | Description |
|---------|-------------|
| **Quality Profile** | Override default quality profile |
| **Root Folder** | Route to specific folder path |
| **Tags** | Apply specific tags for organization |
| **Search on Add** | Automatically search when added |
| **Series Type** | Override series type (`standard`, `anime`, `daily`) |
| **Season Monitoring** | Override monitoring strategy (see below) |

**Season Monitoring Options:**

| Option | Description |
|--------|-------------|
| `all` | All Seasons |
| `future` | Future Seasons |
| `missing` | Missing Episodes |
| `existing` | Existing Episodes |
| `firstSeason` | First Season |
| `lastSeason` | Last Season |
| `latestSeason` | Latest Season |
| `pilot` | Pilot Only |
| `pilotRolling` | Pilot Rolling (auto-expand with session monitoring) |
| `firstSeasonRolling` | First Season Rolling (auto-expand with session monitoring) |
| `recent` | Recent Episodes |
| `monitorSpecials` | Monitor Specials |
| `unmonitorSpecials` | Unmonitor Specials |
| `none` | None |
| `skip` | Skip |

### Radarr

| Setting | Description |
|---------|-------------|
| **Quality Profile** | Override default quality profile |
| **Root Folder** | Route to specific folder path |
| **Tags** | Apply specific tags for organization |
| **Search on Add** | Automatically search when added |
| **Monitor** | Monitor type (`movieOnly`, `movieAndCollection`, `none`) |

## Multi-Instance Routing

Rules can send content to multiple instances simultaneously:

```
Anime Rule 1 → Anime-Sonarr-HD (priority 100)
Anime Rule 2 → Anime-Sonarr-4K (priority 90)
```

Both rules fire for anime content, sending to both instances with their respective configurations.

:::tip Priority Behavior
Priorities only matter when multiple rules target the *same* instance. The highest priority rule wins and applies its settings. Rules targeting *different* instances all execute independently.
:::

For multi-instance synchronization features, see [Multi-Instance Support](multi-instance-support).

## Rule Processing

When content is added to a watchlist:

1. All routing rules are evaluated in priority order
2. Content is sent to all matching instances
3. For multiple rules targeting the same instance, highest priority wins

## Example Rules

**Anime to dedicated instance:**
```
IF genre contains "Anime"
THEN route to "Anime-Sonarr" with "HD-1080p" profile
```

**Kids content with approval:**
```
IF user equals "KidsAccount"
THEN route to "Family-Sonarr" in "/kids" folder
AND require approval
```

**High-rated movies only:**
```
IF imdbRating > 7.5 AND rtCriticRating > 75
THEN route to "Premium-Radarr" with "4K" profile
```

**Long-running series require approval:**
```
IF season > 5
THEN route to default instance
AND require approval with reason "Long-running series"
```

## Best Practices

- Start with simple rules before adding complexity
- Test rules by adding matching content and checking logs
- Document your routing strategy for team collaboration

## Troubleshooting

**Rules not matching:**
- Verify condition fields match available metadata (check TMDB/TVDB)
- Review genre spelling and casing
- Check logs to see rule evaluation

**Content routing to wrong instance:**
- Review rule priorities (highest wins for same instance)
- Check for overlapping rules
- Verify target instance is configured and online

**Anime not detected:**
- Anime database updates weekly (Sundays at 3 AM)
- Verify content has TVDB/TMDB/IMDb external IDs
- Check logs for anime detection results

**Overrides not applying:**
- Confirm rule is matching (check logs)
- Verify override values exist on target instance
- Check rule priority vs conflicting rules

## API Reference

See the [Content Router API documentation](/docs/api/content-router) for managing routing rules programmatically.
