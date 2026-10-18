import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { SettingsPageSkeleton } from '@/components/settings/settings-page-skeleton'
import { HomeSkeleton } from '@/features/home/components/home-skeleton'
import { ContentRouterSkeleton } from '@/features/library/components/content-router/content-router-skeleton'
import { ExclusionsSkeleton } from '@/features/library/components/exclusions/exclusions-skeleton'
import { ArrInstancesSkeleton } from '@/features/library/components/instances/arr-instances-skeleton'
import { SessionMonitoringSkeleton } from '@/features/library/components/session-monitoring/session-monitoring-skeleton'
import { DELETE_SYNC_SKELETON } from '@/features/library/lib/delete-sync/delete-sync-skeleton'
import { PublicContentSkeleton } from '@/features/notifications/components/public-content/public-content-skeleton'
import { WebhooksSkeleton } from '@/features/notifications/components/webhooks/webhooks-skeleton'
import { APPRISE_SKELETON } from '@/features/notifications/lib/apprise-skeleton'
import { DELIVERY_SKELETON } from '@/features/notifications/lib/delivery-skeleton'
import { DISCORD_SKELETON } from '@/features/notifications/lib/discord-skeleton'
import { PLEX_MOBILE_SKELETON } from '@/features/notifications/lib/plex-mobile-skeleton'
import { ApprovalQueueSkeleton } from '@/features/requests/components/approval-queue/approval-queue-skeleton'
import { APPROVAL_SETTINGS_SKELETON } from '@/features/requests/lib/approval-settings-skeleton'
import { QUOTA_SETTINGS_SKELETON } from '@/features/requests/lib/quota-settings-skeleton'
import { ApiKeysSkeleton } from '@/features/system/components/api-keys/api-keys-skeleton'
import { LogsSkeleton } from '@/features/system/components/logs/logs-skeleton'
import { PlexConnectionSkeleton } from '@/features/system/components/plex-connection/plex-connection-skeleton'
import { NewUserDefaultsSkeleton } from '@/features/users/components/new-user-defaults/new-user-defaults-skeleton'
import { PlexUsersSkeleton } from '@/features/users/components/plex-users/plex-users-skeleton'
import { UserPageSkeleton } from '@/features/users/components/user/user-page-skeleton'
import { PLEX_LABELS_SKELETON } from '@/features/users/lib/plex-labels-skeleton'
import { USER_TAGS_SKELETON } from '@/features/users/lib/user-tags-skeleton'
import AppLayout from '@/layouts/app'
import RootLayout from '@/layouts/root'
import AuthenticatedLayout from '@/legacy/layouts/authenticated'
import { BASE_PATH } from '@/lib/basePath.js'
import { NAV_PAGES, pageHref } from '@/lib/navigation'

const LoginPage = lazy(() => import('@/features/auth'))
const HomePage = lazy(() => import('@/features/home'))
const UserTagsPage = lazy(() => import('@/features/users/pages/user-tags'))
const NewUserDefaultsPage = lazy(
  () => import('@/features/users/pages/new-user-defaults'),
)
const PlexLabelsPage = lazy(() => import('@/features/users/pages/plex-labels'))
const PlexUsersPage = lazy(() => import('@/features/users/pages/plex-users'))
const UserPage = lazy(() => import('@/features/users/pages/user'))
const ApprovalQueuePage = lazy(
  () => import('@/features/requests/pages/approval-queue'),
)
const ApprovalSettingsPage = lazy(
  () => import('@/features/requests/pages/approval-settings'),
)
const QuotaSettingsPage = lazy(
  () => import('@/features/requests/pages/quota-settings'),
)
const ContentRouterPage = lazy(
  () => import('@/features/library/pages/content-router'),
)
const ArrInstancesPage = lazy(
  () => import('@/features/library/pages/arr-instances'),
)
const SessionMonitoringPage = lazy(
  () => import('@/features/library/pages/session-monitoring'),
)
const DeleteSyncPage = lazy(
  () => import('@/features/library/pages/delete-sync'),
)
const ExclusionsPage = lazy(() => import('@/features/library/pages/exclusions'))
const DiscordPage = lazy(() => import('@/features/notifications/pages/discord'))
const ApprisePage = lazy(() => import('@/features/notifications/pages/apprise'))
const DeliveryPage = lazy(
  () => import('@/features/notifications/pages/delivery'),
)
const WebhooksPage = lazy(
  () => import('@/features/notifications/pages/webhooks'),
)
const PlexMobilePage = lazy(
  () => import('@/features/notifications/pages/plex-mobile'),
)
const PublicContentPage = lazy(
  () => import('@/features/notifications/pages/public-content'),
)
const ApiKeysPage = lazy(() => import('@/features/system/pages/api-keys'))
const LogsPage = lazy(() => import('@/features/system/pages/logs'))
const PlexConnectionPage = lazy(
  () => import('@/features/system/pages/plex-connection'),
)
const CreateUserPage = lazy(() => import('@/legacy/features/setup'))
const LegacyPlexConfigurationPage = lazy(
  () => import('@/legacy/features/system/pages/plex-connection'),
)
const ApprovalsPage = lazy(() => import('@/legacy/features/requests'))
const NotificationsConfigPage = lazy(
  () => import('@/legacy/features/notifications'),
)
const DashboardPage = lazy(() => import('@/legacy/features/home'))
const LegacyDeleteSyncPage = lazy(
  () => import('@/legacy/features/library/pages/delete-sync'),
)
const LegacyPlexNotificationsPage = lazy(
  () => import('@/legacy/features/system/pages/plex-notifications'),
)
const LegacyNewUserDefaultsPage = lazy(
  () => import('@/legacy/features/users/pages/new-user-defaults'),
)
const LegacySessionMonitoringPage = lazy(
  () => import('@/legacy/features/library/pages/plex-session-monitoring'),
)
const LegacyUserTagsPage = lazy(
  () => import('@/legacy/features/users/pages/user-tags'),
)
const LegacyPlexLabelsPage = lazy(
  () => import('@/legacy/features/users/pages/plex-labels'),
)
const LegacyApiKeysPage = lazy(
  () => import('@/legacy/features/system/pages/api-keys'),
)
const LogViewerPage = lazy(
  () => import('@/legacy/features/system/pages/log-viewer'),
)
const LegacyApprovalSettingsPage = lazy(
  () => import('@/legacy/features/requests/pages/approval-settings'),
)
const LegacyQuotaSettingsPage = lazy(
  () => import('@/legacy/features/requests/pages/quota-settings'),
)
const SonarrInstancesPage = lazy(
  () => import('@/legacy/features/library/pages/sonarr-instances'),
)
const SonarrContentRouterPage = lazy(
  () => import('@/legacy/features/library/pages/sonarr-content-router'),
)
const RadarrInstancesPage = lazy(
  () => import('@/legacy/features/library/pages/radarr-instances'),
)
const RadarrContentRouterPage = lazy(
  () => import('@/legacy/features/library/pages/radarr-content-router'),
)
const NotFoundPage = lazy(() => import('@/legacy/features/not-found'))
const AccountSettingsPage = lazy(() => import('@/legacy/features/account'))

const LoadingFallback = () => null

/**
 * Get the configured base path for the router.
 * Reads from the <base> tag injected by the server.
 */
function getBasename(): string {
  return BASE_PATH === '/' ? '' : BASE_PATH
}

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <RootLayout>
          <Outlet />
        </RootLayout>
      ),
      children: [
        {
          element: <AppLayout />,
          children: [
            {
              index: true,
              element: (
                <Suspense fallback={<HomeSkeleton />}>
                  <HomePage />
                </Suspense>
              ),
            },
            {
              path: 'users',
              element: (
                <Suspense fallback={<PlexUsersSkeleton />}>
                  <PlexUsersPage />
                </Suspense>
              ),
            },
            {
              path: 'users/:id',
              element: (
                <Suspense fallback={<UserPageSkeleton />}>
                  <UserPage />
                </Suspense>
              ),
            },
            {
              path: 'users/tags',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...USER_TAGS_SKELETON} />}
                >
                  <UserTagsPage />
                </Suspense>
              ),
            },
            {
              path: 'users/new-user-defaults',
              element: (
                <Suspense fallback={<NewUserDefaultsSkeleton />}>
                  <NewUserDefaultsPage />
                </Suspense>
              ),
            },
            {
              path: 'users/plex-labels',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...PLEX_LABELS_SKELETON} />}
                >
                  <PlexLabelsPage />
                </Suspense>
              ),
            },
            {
              path: 'requests',
              element: (
                <Suspense fallback={<ApprovalQueueSkeleton />}>
                  <ApprovalQueuePage />
                </Suspense>
              ),
            },
            {
              path: 'requests/settings',
              element: (
                <Suspense
                  fallback={
                    <SettingsPageSkeleton {...APPROVAL_SETTINGS_SKELETON} />
                  }
                >
                  <ApprovalSettingsPage />
                </Suspense>
              ),
            },
            {
              path: 'requests/quotas',
              element: (
                <Suspense
                  fallback={
                    <SettingsPageSkeleton {...QUOTA_SETTINGS_SKELETON} />
                  }
                >
                  <QuotaSettingsPage />
                </Suspense>
              ),
            },
            {
              path: 'library/radarr',
              element: (
                <Suspense fallback={<ArrInstancesSkeleton />}>
                  <ArrInstancesPage key="radarr" type="radarr" />
                </Suspense>
              ),
            },
            {
              path: 'library/sonarr',
              element: (
                <Suspense fallback={<ArrInstancesSkeleton />}>
                  <ArrInstancesPage key="sonarr" type="sonarr" />
                </Suspense>
              ),
            },
            {
              path: 'library/content-router',
              element: (
                <Suspense fallback={<ContentRouterSkeleton />}>
                  <ContentRouterPage />
                </Suspense>
              ),
            },
            {
              path: 'library/exclusions',
              element: (
                <Suspense fallback={<ExclusionsSkeleton />}>
                  <ExclusionsPage />
                </Suspense>
              ),
            },
            {
              path: 'library/delete-sync',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...DELETE_SYNC_SKELETON} />}
                >
                  <DeleteSyncPage />
                </Suspense>
              ),
            },
            {
              path: 'library/session-monitoring',
              element: (
                <Suspense fallback={<SessionMonitoringSkeleton />}>
                  <SessionMonitoringPage />
                </Suspense>
              ),
            },
            {
              path: 'notifications/discord',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...DISCORD_SKELETON} />}
                >
                  <DiscordPage />
                </Suspense>
              ),
            },
            {
              path: 'notifications/apprise',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...APPRISE_SKELETON} />}
                >
                  <ApprisePage />
                </Suspense>
              ),
            },
            {
              path: 'notifications/delivery',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...DELIVERY_SKELETON} />}
                >
                  <DeliveryPage />
                </Suspense>
              ),
            },
            {
              path: 'notifications/webhooks',
              element: (
                <Suspense fallback={<WebhooksSkeleton />}>
                  <WebhooksPage />
                </Suspense>
              ),
            },
            {
              path: 'notifications/plex-mobile',
              element: (
                <Suspense
                  fallback={<SettingsPageSkeleton {...PLEX_MOBILE_SKELETON} />}
                >
                  <PlexMobilePage />
                </Suspense>
              ),
            },
            {
              path: 'notifications/public-content',
              element: (
                <Suspense fallback={<PublicContentSkeleton />}>
                  <PublicContentPage />
                </Suspense>
              ),
            },
            {
              path: 'system/plex',
              element: (
                <Suspense fallback={<PlexConnectionSkeleton />}>
                  <PlexConnectionPage />
                </Suspense>
              ),
            },
            {
              path: 'system/api-keys',
              element: (
                <Suspense fallback={<ApiKeysSkeleton />}>
                  <ApiKeysPage />
                </Suspense>
              ),
            },
            {
              path: 'system/logs',
              element: (
                <Suspense fallback={<LogsSkeleton />}>
                  <LogsPage />
                </Suspense>
              ),
            },
          ],
        },
        {
          path: 'login',
          element: (
            <Suspense fallback={<LoadingFallback />}>
              <LoginPage />
            </Suspense>
          ),
        },
        {
          path: 'create-user',
          element: (
            <Suspense fallback={<LoadingFallback />}>
              <CreateUserPage />
            </Suspense>
          ),
        },
        {
          path: 'plex',
          children: [
            {
              index: true,
              element: (
                <Navigate to={pageHref(NAV_PAGES.plexConnection)} replace />
              ),
            },
            {
              path: 'configuration',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyPlexConfigurationPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'users',
              element: <Navigate to={pageHref(NAV_PAGES.plexUsers)} replace />,
            },
          ],
        },
        {
          path: 'sonarr',
          children: [
            {
              path: 'instances',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <SonarrInstancesPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'content-router',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <SonarrContentRouterPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
          ],
        },
        {
          path: 'radarr',
          children: [
            {
              path: 'instances',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <RadarrInstancesPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'content-router',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <RadarrContentRouterPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
          ],
        },
        {
          path: 'notifications',
          element: (
            <AuthenticatedLayout>
              <Suspense fallback={<LoadingFallback />}>
                <NotificationsConfigPage />
              </Suspense>
            </AuthenticatedLayout>
          ),
        },
        {
          path: 'dashboard',
          element: (
            <AuthenticatedLayout>
              <Suspense fallback={<LoadingFallback />}>
                <DashboardPage />
              </Suspense>
            </AuthenticatedLayout>
          ),
        },
        {
          path: 'account',
          element: (
            <AuthenticatedLayout>
              <Suspense fallback={<LoadingFallback />}>
                <AccountSettingsPage />
              </Suspense>
            </AuthenticatedLayout>
          ),
        },
        {
          path: 'utilities',
          children: [
            {
              path: 'delete-sync',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyDeleteSyncPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'plex-notifications',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyPlexNotificationsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'new-user-defaults',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyNewUserDefaultsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'plex-session-monitoring',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacySessionMonitoringPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'user-tags',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyUserTagsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'plex-labels',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyPlexLabelsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'api-keys',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyApiKeysPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'log-viewer',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LogViewerPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
          ],
        },
        {
          path: 'approvals',
          children: [
            {
              index: true,
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <ApprovalsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'settings',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyApprovalSettingsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
            {
              path: 'quota-settings',
              element: (
                <AuthenticatedLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <LegacyQuotaSettingsPage />
                  </Suspense>
                </AuthenticatedLayout>
              ),
            },
          ],
        },
        {
          path: '*',
          element: (
            <Suspense fallback={<LoadingFallback />}>
              <NotFoundPage />
            </Suspense>
          ),
        },
      ],
    },
  ],
  {
    basename: getBasename(),
  },
)
