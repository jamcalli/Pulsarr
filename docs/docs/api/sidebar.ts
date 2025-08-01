import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: 'doc',
      id: 'api/pulsarr-api',
    },
    {
      type: 'category',
      label: 'API Keys',
      link: {
        type: 'doc',
        id: 'api/api-keys',
      },
      items: [
        {
          type: 'doc',
          id: 'api/create-api-key',
          label: 'Create API key',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-api-keys',
          label: 'Get API keys',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/revoke-api-key',
          label: 'Revoke API key',
          className: 'api-method delete',
        },
      ],
    },
    {
      type: 'category',
      label: 'Approval',
      link: {
        type: 'doc',
        id: 'api/approval',
      },
      items: [
        {
          type: 'doc',
          id: 'api/create-approval-request',
          label: 'Create approval request',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-approval-requests',
          label: 'Get approval requests',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-approval-request-by-id',
          label: 'Get approval request by ID',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/update-approval-request',
          label: 'Update approval request',
          className: 'api-method patch',
        },
        {
          type: 'doc',
          id: 'api/delete-approval-request',
          label: 'Delete approval request',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/reject-approval-request',
          label: 'Reject approval request',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-approval-stats',
          label: 'Get approval statistics',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/approve-and-execute-request',
          label: 'Approve and execute request',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/bulk-approve-requests',
          label: 'Bulk approve requests',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/bulk-reject-requests',
          label: 'Bulk reject requests',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/bulk-delete-requests',
          label: 'Bulk delete requests',
          className: 'api-method delete',
        },
      ],
    },
    {
      type: 'category',
      label: 'Authentication',
      link: {
        type: 'doc',
        id: 'api/authentication',
      },
      items: [
        {
          type: 'doc',
          id: 'api/update-user-password',
          label: 'Update user password',
          className: 'api-method put',
        },
        {
          type: 'doc',
          id: 'api/create-admin-user',
          label: 'Create admin user',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/login-user',
          label: 'User login',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/logout-user',
          label: 'User logout',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Config',
      link: {
        type: 'doc',
        id: 'api/config',
      },
      items: [
        {
          type: 'doc',
          id: 'api/get-config',
          label: 'Get configuration',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/update-config',
          label: 'Update configuration',
          className: 'api-method put',
        },
      ],
    },
    {
      type: 'category',
      label: 'Content Router',
      link: {
        type: 'doc',
        id: 'api/content-router',
      },
      items: [
        {
          type: 'doc',
          id: 'api/get-all-router-rules',
          label: 'Get all router rules',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/create-router-rule',
          label: 'Create router rule',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-router-rules-by-type',
          label: 'Get router rules by type',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-router-rules-by-target',
          label: 'Get router rules by target',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-router-rule-by-id',
          label: 'Get router rule by ID',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/update-router-rule',
          label: 'Update router rule',
          className: 'api-method put',
        },
        {
          type: 'doc',
          id: 'api/delete-router-rule',
          label: 'Delete router rule',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/get-router-rules-by-target-type',
          label: 'Get router rules by target type',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/toggle-router-rule',
          label: 'Toggle router rule',
          className: 'api-method patch',
        },
        {
          type: 'doc',
          id: 'api/get-router-plugins',
          label: 'Get router plugins',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-plugin-metadata',
          label: 'Get plugin metadata',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Metadata',
      link: {
        type: 'doc',
        id: 'api/metadata',
      },
      items: [
        {
          type: 'doc',
          id: 'api/refresh-metadata',
          label: 'Refresh metadata for all watchlist items',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Notifications',
      link: {
        type: 'doc',
        id: 'api/notifications',
      },
      items: [
        {
          type: 'doc',
          id: 'api/start-discord-bot',
          label: 'Start Discord bot',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/stop-discord-bot',
          label: 'Stop Discord bot',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/validate-discord-webhooks',
          label: 'Validate Discord webhooks',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/process-media-webhook',
          label: 'Process media webhook',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Plex',
      link: {
        type: 'doc',
        id: 'api/plex',
      },
      items: [
        {
          type: 'doc',
          id: 'api/get-self-watchlist-items',
          label: 'Get self watchlist items',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-others-watchlist-tokens',
          label: 'Get others watchlist tokens',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/ping-plex',
          label: 'Test Plex server connection',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/generate-rss-feeds',
          label: 'Generate RSS feeds',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/parse-rss-watchlists',
          label: 'Parse RSS watchlists',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-watchlist-genres',
          label: 'Get watchlist genres',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/configure-plex-notifications',
          label: 'Configure Plex notifications',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/remove-plex-notifications',
          label: 'Remove Plex notifications',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/get-plex-notification-status',
          label: 'Get Plex notification status',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/discover-plex-servers',
          label: 'Discover Plex servers',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Progress',
      link: {
        type: 'doc',
        id: 'api/progress',
      },
      items: [
        {
          type: 'doc',
          id: 'api/stream-progress',
          label: 'Stream progress events',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Quota',
      link: {
        type: 'doc',
        id: 'api/quota',
      },
      items: [
        {
          type: 'doc',
          id: 'api/create-user-quota',
          label: 'Create user quota',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-users-with-quotas',
          label: 'Get all users with quotas',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-user-quotas',
          label: 'Get user quotas',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/update-user-quotas',
          label: 'Update user quotas',
          className: 'api-method patch',
        },
        {
          type: 'doc',
          id: 'api/delete-user-quota',
          label: 'Delete user quota',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/update-separate-user-quotas',
          label: 'Update separate movie and show quotas',
          className: 'api-method patch',
        },
        {
          type: 'doc',
          id: 'api/get-user-quota-status',
          label: 'Get user quota status',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-bulk-user-quota-status',
          label: 'Get quota status for multiple users',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/record-quota-usage',
          label: 'Record quota usage',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-quota-usage-history',
          label: 'Get quota usage history',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-daily-usage-stats',
          label: 'Get daily usage statistics',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/bulk-quota-operations',
          label: 'Bulk quota operations',
          className: 'api-method patch',
        },
        {
          type: 'doc',
          id: 'api/cleanup-old-quota-usage',
          label: 'Cleanup old quota usage',
          className: 'api-method delete',
        },
      ],
    },
    {
      type: 'category',
      label: 'Radarr',
      link: {
        type: 'doc',
        id: 'api/radarr',
      },
      items: [
        {
          type: 'doc',
          id: 'api/create-radarr-tag',
          label: 'Create Radarr tag',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-radarr-quality-profiles',
          label: 'Get Radarr quality profiles',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-radarr-instances',
          label: 'Get Radarr instances',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/create-radarr-instance',
          label: 'Create Radarr instance',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/update-radarr-instance',
          label: 'Update Radarr instance',
          className: 'api-method put',
        },
        {
          type: 'doc',
          id: 'api/delete-radarr-instance',
          label: 'Delete Radarr instance',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/get-radarr-root-folders',
          label: 'Get Radarr root folders',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-radarr-tags',
          label: 'Get Radarr tags',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/test-radarr-connection',
          label: 'Test Radarr connection',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Scheduler',
      link: {
        type: 'doc',
        id: 'api/scheduler',
      },
      items: [
        {
          type: 'doc',
          id: 'api/get-all-schedules',
          label: 'Get all job schedules',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/create-schedule',
          label: 'Create job schedule',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-schedule-by-name',
          label: 'Get job schedule by name',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/update-schedule',
          label: 'Update job schedule',
          className: 'api-method put',
        },
        {
          type: 'doc',
          id: 'api/delete-schedule',
          label: 'Delete job schedule',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/run-job-now',
          label: 'Run job immediately',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/toggle-schedule',
          label: 'Toggle job schedule',
          className: 'api-method patch',
        },
        {
          type: 'doc',
          id: 'api/dry-run-delete-sync',
          label: 'Dry-run delete sync',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Session Monitoring',
      link: {
        type: 'doc',
        id: 'api/session-monitoring',
      },
      items: [
        {
          type: 'doc',
          id: 'api/get-rolling-monitored-shows',
          label: 'Get rolling monitored shows',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/run-session-monitor',
          label: 'Run session monitor manually',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/delete-rolling-monitored-show',
          label: 'Delete rolling monitored show',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/reset-rolling-monitored-show',
          label: 'Reset rolling monitored show',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-inactive-rolling-monitored-shows',
          label: 'Get inactive rolling monitored shows',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/reset-inactive-rolling-monitored-shows',
          label: 'Reset inactive rolling monitored shows',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Sonarr',
      link: {
        type: 'doc',
        id: 'api/sonarr',
      },
      items: [
        {
          type: 'doc',
          id: 'api/create-sonarr-tag',
          label: 'Create Sonarr tag',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-sonarr-quality-profiles',
          label: 'Get Sonarr quality profiles',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-sonarr-root-folders',
          label: 'Get Sonarr root folders',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-sonarr-instances',
          label: 'Get Sonarr instances',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/create-sonarr-instance',
          label: 'Create Sonarr instance',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/update-sonarr-instance',
          label: 'Update Sonarr instance',
          className: 'api-method put',
        },
        {
          type: 'doc',
          id: 'api/delete-sonarr-instance',
          label: 'Delete Sonarr instance',
          className: 'api-method delete',
        },
        {
          type: 'doc',
          id: 'api/get-sonarr-tags',
          label: 'Get Sonarr tags',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/test-sonarr-connection',
          label: 'Test Sonarr connection',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Statistics',
      link: {
        type: 'doc',
        id: 'api/statistics',
      },
      items: [
        {
          type: 'doc',
          id: 'api/get-all-dashboard-stats',
          label: 'Get all dashboard statistics',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-instance-content-breakdown',
          label: 'Get instance content breakdown',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-top-genres',
          label: 'Get top genres',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-most-watched-shows',
          label: 'Get most watched shows',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-most-watched-movies',
          label: 'Get most watched movies',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-top-users',
          label: 'Get top users',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-recent-activity',
          label: 'Get recent activity',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-availability-stats',
          label: 'Get availability time stats',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-grabbed-to-notified-stats',
          label: 'Get grabbed to notified time stats',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-status-transitions',
          label: 'Get status transition metrics',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-status-flow',
          label: 'Get status flow data',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-notification-stats',
          label: 'Get notification statistics',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Sync',
      link: {
        type: 'doc',
        id: 'api/sync',
      },
      items: [
        {
          type: 'doc',
          id: 'api/sync-instance',
          label: 'Sync specific instance',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/sync-all-instances',
          label: 'Sync all instances',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Tags',
      link: {
        type: 'doc',
        id: 'api/tags',
      },
      items: [
        {
          type: 'doc',
          id: 'api/get-tagging-status',
          label: 'Get tagging status',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/update-tagging-config',
          label: 'Update tagging config',
          className: 'api-method put',
        },
        {
          type: 'doc',
          id: 'api/create-user-tags',
          label: 'Create user tags',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/sync-user-tags',
          label: 'Sync user tags',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/cleanup-orphaned-tags',
          label: 'Cleanup orphaned tags',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/remove-all-user-tags',
          label: 'Remove all user tags',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'Tautulli',
      link: {
        type: 'doc',
        id: 'api/tautulli',
      },
      items: [
        {
          type: 'doc',
          id: 'api/sync-tautulli-notifiers',
          label: 'Sync user notifiers',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/test-tautulli-connection-with-credentials',
          label: 'Test Tautulli connection with provided credentials',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/test-tautulli-connection',
          label: 'Test Tautulli connection',
          className: 'api-method post',
        },
      ],
    },
    {
      type: 'category',
      label: 'TMDB',
      link: {
        type: 'doc',
        id: 'api/tmdb',
      },
      items: [
        {
          type: 'doc',
          id: 'api/get-tmdb-metadata-by-guid',
          label: 'Get TMDB metadata by GUID',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-tmdb-movie-metadata',
          label: 'Get movie metadata from TMDB',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-tmdb-tv-metadata',
          label: 'Get TV show metadata from TMDB',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-tmdb-regions',
          label: 'Get available TMDB regions',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Users',
      link: {
        type: 'doc',
        id: 'api/users',
      },
      items: [
        {
          type: 'doc',
          id: 'api/bulk-update-users',
          label: 'Bulk update users',
          className: 'api-method patch',
        },
        {
          type: 'doc',
          id: 'api/get-current-user',
          label: 'Get current user information',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-users-list',
          label: 'Get users list',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-users-with-counts',
          label: 'Get users with watchlist counts',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/create-user',
          label: 'Create user',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/update-user',
          label: 'Update user',
          className: 'api-method patch',
        },
        {
          type: 'doc',
          id: 'api/get-user-by-id',
          label: 'Get user by ID',
          className: 'api-method get',
        },
        {
          type: 'doc',
          id: 'api/get-user-watchlist',
          label: 'Get user watchlist items',
          className: 'api-method get',
        },
      ],
    },
    {
      type: 'category',
      label: 'Watchlist Workflow',
      link: {
        type: 'doc',
        id: 'api/watchlist-workflow',
      },
      items: [
        {
          type: 'doc',
          id: 'api/start-watchlist-workflow',
          label: 'Start watchlist workflow',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/stop-watchlist-workflow',
          label: 'Stop watchlist workflow',
          className: 'api-method post',
        },
        {
          type: 'doc',
          id: 'api/get-watchlist-workflow-status',
          label: 'Get watchlist workflow status',
          className: 'api-method get',
        },
      ],
    },
  ],
}

export default sidebar.apisidebar
