---
sidebar_position: 4
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Plex Session Monitoring

Pulsarr's Session Monitoring feature intelligently tracks active Plex viewing sessions and automatically triggers Sonarr searches for upcoming content based on user viewing patterns. This ensures that the next episodes or seasons are ready before users finish watching their current content.

## Key Features

- **Real-Time Session Monitoring**: Tracks active Plex viewing sessions as they happen
- **Smart Episode Detection**: Automatically identifies when users are near the end of seasons
- **Rolling Monitoring Support**: Progressive season downloads that expand based on viewing patterns
- **User Filtering**: Optionally restrict monitoring to specific Plex users
- **Deduplication**: Prevents duplicate searches with intelligent 7-day caching
- **Pilot Episode Handling**: Special logic for standalone pilot episodes
- **Cross-Instance Support**: Works across all your Sonarr instances simultaneously

## How It Works

Session Monitoring operates on a simple principle: **anticipate what users will want to watch next**.

### Standard Monitoring

When a user is watching a TV episode, the system:

1. **Detects the viewing session** via Plex's active sessions API
2. **Calculates remaining episodes** in the current season using Sonarr data
3. **Triggers searches** when users approach the end of a season (configurable threshold)
4. **Handles next seasons** by either searching existing seasons or enabling monitoring for new content

### Rolling Monitoring

For shows configured with rolling monitoring options:

1. **Starts minimal** - Only monitors pilot episode or first season initially
2. **Tracks viewing progress** - Records what users have watched
3. **Expands intelligently** - Adds next season monitoring when users near completion
4. **Switches to full monitoring** - Eventually transitions to monitoring all future content

## Rolling Monitoring Options

Rolling monitoring provides two progressive strategies for new content:

### Pilot Rolling
- **Initial State**: Only the pilot episode is monitored
- **Expansion**: When users watch the pilot, Season 1 remainder is searched
- **Progressive**: Additional seasons added as users progress
- **Best For**: New shows where you want to test user interest

### First Season Rolling  
- **Initial State**: All of Season 1 is monitored
- **Expansion**: Season 2 monitoring added when users near Season 1 completion
- **Progressive**: Subsequent seasons added based on viewing
- **Best For**: Established shows where Season 1 commitment is acceptable

## Configuration

### Basic Settings

Navigate to **Utilities > Plex Session Monitoring** to configure:

#### Enable/Disable Control
- **Session Monitoring Status**: Enable or disable the entire feature
  - Default: Disabled
  - When enabled, activates all monitoring features
  - When disabled, no sessions are processed

#### Monitoring Configuration
- **Polling Interval**: How often to check for active sessions (1-1440 minutes)
  - Default: 15 minutes
  - Lower values = more responsive monitoring
  - Higher values = reduced server load
  - Recommended: 15-30 minutes

- **Remaining Episodes Threshold**: When to trigger searches (1-10 episodes)
  - Default: 2 episodes
  - Example: With threshold 2, searches trigger when watching episode 8 of a 10-episode season
  - Recommended: 2-3 episodes

#### Filtering Options
- **Filter Users**: Optionally restrict monitoring to specific Plex users
  - Leave empty to monitor all users
  - Add specific users to focus monitoring efforts
  - Useful for households with different viewing preferences

### Rolling Monitoring Reset Settings

#### Automatic Reset
- **Enable Automatic Reset**: Automatically reset inactive rolling monitored shows
  - Default: Enabled
  - Reverts shows to original monitoring state (pilot-only or first-season-only)
  - Deletes excess episode files to save storage space
  - Helps manage storage for shows that users have abandoned

#### Reset Configuration
- **Inactivity Reset Days**: Days without watching before resetting (1-365 days)
  - Default: 7 days
  - Shows not watched within this period are considered inactive
  - Shorter periods = more aggressive storage management
  - Longer periods = more lenient for sporadic viewing

- **Auto Reset Check Interval**: How often to check for inactive shows (1-168 hours)
  - Default: 24 hours
  - Controls how frequently the system checks for inactive shows
  - Lower values = more frequent cleanup checks
  - Higher values = less server load

### Rolling Monitoring Management

The interface provides real-time status and management tools:

#### Status Overview
- **Active Shows**: Shows currently being tracked with rolling monitoring
  - Displays count of actively monitored shows
  - Quick view button to see all active shows
  - Shows expand their monitoring based on viewing patterns

- **Inactive Shows**: Shows that haven't been watched recently
  - Displays count with customizable inactivity threshold
  - Yellow warning badge for reset candidates
  - Reset all button for bulk cleanup
  - Adjustable day threshold for viewing inactive shows

#### Management Actions
- **Check Sessions**: Manually trigger a session monitoring check
  - Runs the monitoring process immediately
  - Useful for testing or forcing immediate updates
  - Shows processing status while running

- **View Shows**: Detailed tables showing all tracked shows
  - Show title and monitoring type (Pilot/First Season)
  - Current monitored season
  - Last activity timestamp
  - Individual reset/remove actions per show

- **Reset Actions**: 
  - **Reset Show**: Reverts to original monitoring state and deletes excess files
  - **Remove from Monitoring**: Stops tracking without affecting Sonarr settings
  - Confirmation dialogs prevent accidental actions

### Sonarr Integration

Rolling monitoring options appear in two places:

#### Instance Defaults
Configure default rolling behavior in **Sonarr Instance Settings**:
- Set the default season monitoring strategy for all content added to an instance
- Choose from standard options (All, Future, etc.) or rolling options

#### Content Router Rules
Override instance defaults in **Content Router Rules**:
- Apply rolling monitoring to specific content based on conditions
- Mix rolling and standard monitoring strategies
- Target rolling monitoring to specific genres, users, or criteria

:::tip Pro Tip
Rolling monitoring options are only available when Session Monitoring is enabled. If you don't see these options, check that Session Monitoring is configured and running.
:::

## Best Practices

### Polling Interval Selection
- **High Activity Users**: 10-15 minutes for responsive monitoring
- **Casual Viewing**: 30-60 minutes to balance responsiveness with resource usage
- **Large Deployments**: 60+ minutes to minimize server load

### Threshold Configuration
- **Conservative**: 3-4 episodes remaining (ensures content is ready well in advance)
- **Balanced**: 2-3 episodes remaining (good balance of timing and efficiency)
- **Aggressive**: 1-2 episodes remaining (just-in-time downloading)

### User Filtering Strategy
- **Family Accounts**: Filter to adult users who typically finish series
- **Shared Servers**: Monitor only primary users or content decision makers
- **Testing**: Start with a single user to validate configuration

### Rolling Monitoring Strategy
- **New Shows**: Use "Pilot Rolling" to test user engagement
- **Popular Shows**: Use "First Season Rolling" for established content
- **Trusted Content**: Use standard "All" monitoring for known favorites

## Technical Details

### Session Detection
- Uses Plex's `/status/sessions` API endpoint
- Processes only TV episode sessions (ignores movies and music)
- Extracts series metadata including TVDB IDs for accurate matching

### Deduplication Logic
- Maintains 7-day cache of processed sessions
- Prevents duplicate searches for the same series/season combination
- Automatically cleans up expired cache entries

### Series Matching
- Primary: TVDB ID matching between Plex and Sonarr
- Fallback: IMDB ID matching when available
- Last Resort: Title matching (case-insensitive)

### Error Handling
- Graceful degradation when Plex is unavailable
- Retry logic for Sonarr API calls
- Comprehensive logging for troubleshooting

## Monitoring and Logs

Session Monitoring provides detailed logging for troubleshooting:

- **Session Processing**: Which sessions are being monitored
- **Search Triggers**: When and why searches are initiated
- **Rolling Updates**: Progression of rolling monitoring expansions
- **Error Conditions**: API failures, network issues, or configuration problems

Check your Pulsarr logs for session monitoring activity. Look for log entries such as:
- `"Found X active Plex sessions"` - Shows when sessions are detected
- `"Processing session: ShowName S01E08 watched by Username"` - Individual session processing
- `"Successfully triggered search for ShowName Season 2"` - When searches are initiated
- `"Expanded monitoring for ShowName to include season 3"` - Rolling monitoring progression
- `"Session monitoring complete. Processed: X, Triggered: Y"` - Summary of monitoring cycles

## Environment Variable Configuration

Session monitoring can also be configured via the `plexSessionMonitoring` environment variable in your `.env` file. This is useful for Docker deployments or when you want to set defaults before accessing the web UI.

```env
# Plex Session Monitoring Configuration (JSON format)
plexSessionMonitoring='{"enabled":false,"pollingIntervalMinutes":15,"remainingEpisodes":2,"filterUsers":[],"enableAutoReset":true,"inactivityResetDays":7,"autoResetIntervalHours":24}'
```

The JSON object supports the following properties:
- `enabled`: Enable/disable session monitoring (default: `false`)
- `pollingIntervalMinutes`: How often to check sessions (default: `15`, range: 1-1440)
- `remainingEpisodes`: Threshold for triggering searches (default: `2`, range: 1-10)
- `filterUsers`: Array of usernames to monitor, empty for all (default: `[]`)
- `enableAutoReset`: Enable automatic reset feature (default: `true`)
- `inactivityResetDays`: Days before considering show inactive (default: `7`, range: 1-365)
- `autoResetIntervalHours`: How often to check for inactive shows (default: `24`, range: 1-168)

Example with custom settings:
```env
# Enable monitoring with custom thresholds
plexSessionMonitoring='{"enabled":true,"pollingIntervalMinutes":30,"remainingEpisodes":3,"filterUsers":["Alice","Bob"],"enableAutoReset":true,"inactivityResetDays":14,"autoResetIntervalHours":12}'
```

:::tip
Environment variable settings override database settings. If you set values in the `.env` file, they will take precedence over settings configured in the web UI.
:::

## User Interface

The Session Monitoring configuration is located in the **Utilities** section of the Pulsarr web interface. The accordion-style interface provides clear sections for:

- **Enable/Disable Control**: Quick toggle to activate or deactivate the entire feature
- **Monitoring Configuration**: Core settings like polling interval and episode thresholds
- **Filtering Options**: User selection and filtering controls
- **Rolling Monitoring Reset Settings**: Automatic cleanup configuration for inactive shows
- **Rolling Monitoring Status**: Real-time view of active and inactive shows with management actions
- **Action Controls**: Save/cancel options with visual feedback

The interface features:
- **Compact Layout**: Settings organized in a 2-column grid to minimize vertical space
- **Visual Status Indicators**: Blue-themed cards showing active/inactive show counts
- **Inline Management**: Quick access to view, reset, and manage tracked shows
- **Confirmation Dialogs**: Prevent accidental actions with clear explanations
- **Responsive Design**: Optimized for both desktop and mobile viewing

<img src={useBaseUrl('/img/Plex-Session-Monitoring.png')} alt="Plex Session Monitoring Configuration Interface" />

## Troubleshooting

### Sessions Not Being Detected
1. Verify Plex server connection in **Plex** settings
2. Check that users are actively watching content (not paused for extended periods)
3. Confirm polling interval isn't too high
4. Review logs for Plex API connection errors

### Searches Not Triggering
1. Verify series exists in Sonarr with matching metadata
2. Check threshold settings aren't too conservative
3. Confirm Sonarr instance is accessible and responsive
4. Review deduplication cache (may have processed recently)

### Rolling Monitoring Not Working
1. Ensure Session Monitoring is enabled and running
2. Verify content was added with rolling monitoring options
3. Check database for rolling monitoring entries
4. Confirm Sonarr series has complete season metadata

### Performance Issues
1. Increase polling interval to reduce API calls
2. Enable user filtering to limit session processing
3. Check Plex server performance and connection stability
4. Monitor Sonarr instance response times

## Integration with Other Features

### Content Router
- Rolling monitoring options available in route configuration
- Apply different monitoring strategies based on content criteria
- Override instance defaults for specific content types

### User Tagging
- Session monitoring respects user tag configurations
- Triggered searches inherit user tags from original requests
- Rolling progression maintains user attribution

### Delete Sync
- Rolling monitored content participates in delete sync operations
- Progression history preserved during sync operations
- Tag-based deletion modes work with rolling monitoring

Session Monitoring transforms Pulsarr from reactive to proactive, ensuring your users always have the next episode ready to watch.

## Attribution

The Session Monitoring workflow was inspired by [prefetcharr](https://github.com/p-hueber/prefetcharr) by p-hueber. If you find this feature useful, please consider giving their project a ⭐ on GitHub!